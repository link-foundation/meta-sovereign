import { spawn } from 'node:child_process';
import { answerModelFailure as failure } from './answer-model-config.js';
import { debugQuestionTurn } from './question-turns.js';

const argumentsFor = ({ system, schema, settings }) => [
  '--bare',
  '--print',
  '--tools',
  '',
  '--disallowedTools',
  'mcp__*',
  '--no-session-persistence',
  '--no-chrome',
  '--output-format',
  'json',
  '--max-turns',
  '1',
  '--json-schema',
  JSON.stringify(schema),
  '--system-prompt',
  system,
  ...(settings.model ? ['--model', settings.model] : []),
];

const processDraft = (input, { start, command, prefix }) =>
  new Promise((resolve, reject) => {
    let child;
    let refusal;
    let stdout = '';
    let outputBytes = 0;
    let errorBytes = 0;
    let escalation;
    const terminate = (code) => {
      refusal ??= failure(code, 'The local draft model did not complete.');
      if (child && child.exitCode === null) {
        child.kill('SIGTERM');
        escalation ??= globalThis.setTimeout(() => child.kill('SIGKILL'), 500);
      }
    };
    const abort = () => terminate('answer-model-stopped');
    if (input.signal.aborted) {
      reject(failure('answer-model-stopped', 'Draft model stopped.'));
      return;
    }
    try {
      child = start(command, [...prefix, ...argumentsFor(input)], {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      reject(
        failure('answer-model-unavailable', 'Claude Code could not be started.')
      );
      return;
    }
    const deadline = globalThis.setTimeout(
      () => terminate('answer-model-timeout'),
      input.settings.timeoutMs
    );
    input.signal.addEventListener('abort', abort, { once: true });
    if (input.signal.aborted) {
      abort();
    }
    child.stdout.setEncoding('utf8');
    child.on('error', () => {
      refusal ??= failure(
        'answer-model-unavailable',
        'Claude Code could not be started.'
      );
    });
    child.stdin.on('error', () => terminate('answer-model-input'));
    child.stdout.on('data', (chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > 128 * 1024) {
        terminate('answer-model-output');
      } else {
        stdout += chunk.toString();
      }
    });
    child.stderr.on('data', (chunk) => {
      errorBytes += chunk.length;
      if (errorBytes > 64 * 1024) {
        terminate('answer-model-output');
      }
    });
    child.once('close', (code) => {
      globalThis.clearTimeout(deadline);
      globalThis.clearTimeout(escalation);
      input.signal.removeEventListener('abort', abort);
      debugQuestionTurn('model-process-closed', {
        code,
        outputBytes,
        errorBytes,
        refused: Boolean(refusal),
      });
      if (refusal || code !== 0) {
        reject(
          refusal ??
            failure(
              'answer-model-exit',
              'Claude Code exited without a confirmed draft.'
            )
        );
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.is_error || !result.structured_output) {
          throw new Error('missing structured result');
        }
        resolve(result.structured_output);
      } catch {
        reject(
          failure(
            'answer-model-response',
            'Claude Code returned an invalid structured result.'
          )
        );
      }
    });
    try {
      child.stdin.end(input.prompt);
    } catch {
      terminate('answer-model-input');
    }
  });

/** One bounded, tool-free print request at a time. Stop owns the actual child. */
export const createLocalAnswerModel = ({
  start = spawn,
  command = 'claude',
  prefix = [],
} = {}) => {
  let stopping = false;
  let active;
  return {
    draft: async (input) => {
      if (stopping || active) {
        throw failure(
          stopping ? 'answer-model-stopped' : 'answer-model-busy',
          'The local draft model is unavailable for this request.'
        );
      }
      if (new TextEncoder().encode(input.prompt).length > 128 * 1024) {
        throw failure('answer-model-context', 'Draft input exceeds 128 KiB.');
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      input.signal?.addEventListener('abort', abort, { once: true });
      if (input.signal?.aborted) {
        abort();
      }
      const task = processDraft(
        { ...input, signal: controller.signal },
        { start, command, prefix }
      );
      active = { controller, task };
      try {
        return await task;
      } finally {
        input.signal?.removeEventListener('abort', abort);
        active = null;
      }
    },
    stop: async () => {
      stopping = true;
      const owned = active;
      owned?.controller.abort();
      await owned?.task.catch(() => {});
    },
  };
};
