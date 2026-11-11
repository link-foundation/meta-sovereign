import childProcess from 'node:child_process';
import { assignmentFailure } from './validation.js';
import { debugQuestionTurn } from '../automation/question-turns.js';

/** Bounded output and an owned process tree, including git's transport helpers. */
export const runAssignmentCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const { signal, cwd, input = '' } = options;
    if (signal?.aborted) {
      reject(assignmentFailure('stopped', 'Assignment operation stopped.'));
      return;
    }
    const windows = process.platform === 'win32';
    let child;
    let killer;
    let refusal;
    let stdout = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stderr = '';
    let inputFailure = null;
    const terminate = (code) => {
      refusal ??= assignmentFailure(
        code,
        'The assignment command did not complete.'
      );
      if (!child?.pid) {
        return;
      }
      if (windows) {
        killer ??= new Promise((done) => {
          const task = childProcess.spawn(
            'taskkill',
            ['/PID', String(child.pid), '/T', '/F'],
            {
              windowsHide: true,
              stdio: 'ignore',
            }
          );
          task.once('error', () => child.kill('SIGKILL'));
          task.once('close', done);
        });
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    };
    const abort = () => terminate('stopped');
    try {
      child = childProcess.spawn(command, args, {
        cwd,
        shell: false,
        detached: !windows,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
        },
        // Commands without payloads never own a pipe that can race their exit.
        stdio: [input === '' ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
    } catch {
      reject(
        assignmentFailure(
          'unavailable',
          'The assignment command is unavailable.'
        )
      );
      return;
    }
    const timer = globalThis.setTimeout(() => terminate('timeout'), 120000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes > 2 * 1024 * 1024) {
        terminate('output');
      } else {
        stdout += chunk;
      }
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 64 * 1024) {
        terminate('output');
      } else {
        stderr += chunk.toString('utf8');
      }
    });
    child.once('error', () => {
      refusal ??= assignmentFailure(
        'unavailable',
        'The assignment command is unavailable.'
      );
    });
    child.stdin?.on('error', (error) => {
      inputFailure = String(error.code ?? 'unknown').slice(0, 80);
      terminate('input');
    });
    child.once('close', async (code) => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      await killer;
      if (refusal || code !== 0) {
        const error =
          refusal ??
          assignmentFailure('command', 'The assignment command failed.');
        // HTTP headers are inspected privately by the adapter, never returned to UI.
        Object.defineProperty(error, 'commandOutput', { value: stdout });
        Object.defineProperty(error, 'commandError', { value: stderr });
        debugQuestionTurn('assignment-command-failed', {
          command,
          code,
          refusal: error.code,
          stdoutBytes,
          stderrBytes,
          inputFailure,
        });
        reject(error);
      } else {
        resolve({ stdout });
      }
    });
    child.stdin?.end(input);
  });
