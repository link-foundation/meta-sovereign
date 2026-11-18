import { spawn } from 'node:child_process';
import { cvTranslationFailure as failure } from './cv-translation-record.js';

/** Bounded private pipe; do not expose process output in errors or console logs. */
export const runCvTranslator = (
  command,
  args,
  { input = '', signal, cwd, env, timeoutMs = 120000, start = spawn } = {}
) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(failure('stopped'));
      return;
    }
    let child;
    let refused;
    let output = '';
    let bytes = 0;
    let errors = 0;
    let escalation;
    const terminate = (reason) => {
      refused ??= failure(reason);
      if (child?.exitCode === null) {
        child.kill('SIGTERM');
        escalation ??= globalThis.setTimeout(() => child.kill('SIGKILL'), 500);
      }
    };
    const abort = () => terminate('stopped');
    try {
      child = start(command, args, {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
        ...(env ? { env: { ...process.env, ...env } } : {}),
      });
    } catch {
      reject(failure('unavailable'));
      return;
    }
    const deadline = globalThis.setTimeout(
      () => terminate('timeout'),
      timeoutMs
    );
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
    child.on('error', () => {
      refused ??= failure('unavailable');
    });
    child.stdin.on('error', () => terminate('input'));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 128 * 1024) {
        terminate('output');
      } else {
        output += chunk;
      }
    });
    child.stderr.on('data', (chunk) => {
      errors += chunk.length;
      if (errors > 32 * 1024) {
        terminate('output');
      }
    });
    child.once('close', (code) => {
      globalThis.clearTimeout(deadline);
      globalThis.clearTimeout(escalation);
      signal?.removeEventListener('abort', abort);
      if (refused || code !== 0) {
        reject(refused ?? failure('exit'));
      } else {
        resolve(output);
      }
    });
    try {
      child.stdin.end(input);
    } catch {
      terminate('input');
    }
  });
