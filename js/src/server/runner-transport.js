import { execFile } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';

export const quoteRunnerArgument = (value) =>
  `'${value.replaceAll("'", "'\\''")}'`;

/** Keep remote argv out of ssh's command string; send a quoted script on stdin. */
export const runnerInvocation = (target, argv) =>
  target.host
    ? {
        file: 'ssh',
        args: ['-T', '-o', 'BatchMode=yes', '--', target.host, 'sh -s'],
        input: `set -eu\nexport LC_ALL=C\ncd ${quoteRunnerArgument(target.directory)}\nexec ${argv.map(quoteRunnerArgument).join(' ')}\n`,
      }
    : { file: argv[0], args: argv.slice(1), cwd: target.directory };

/** Bound commands without releasing their owner before the real child closes. */
export const createRunnerTransport =
  ({
    exec = execFile,
    clock = { setTimeout, clearTimeout },
    deadlineMs = 10000,
    killAfterMs = 1000,
    trace = (event) => {
      if (process.env.MS_RUNNER_TRANSPORT_DEBUG === '1') {
        console.error(`[runner-transport] ${event}`);
      }
    },
  } = {}) =>
  (target, argv, { signal } = {}) =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve({ code: 'ABORT_ERR', stdout: '', stderr: '', aborted: true });
        return;
      }
      const { file, args, cwd, input } = runnerInvocation(target, argv);
      let reply;
      let closed = false;
      let timedOut = false;
      let escalation;
      const finish = () => {
        if (closed && reply) {
          clock.clearTimeout(deadline);
          clock.clearTimeout(escalation);
          signal?.removeEventListener('abort', cancel);
          trace('closed');
          resolve({
            ...reply,
            code: timedOut
              ? 'ETIMEDOUT'
              : signal?.aborted
                ? 'ABORT_ERR'
                : reply.code,
            aborted: timedOut || signal?.aborted === true,
          });
        }
      };
      const child = exec(
        file,
        args,
        {
          cwd,
          encoding: 'utf8',
          maxBuffer: 64 * 1024,
          env: { ...process.env, LC_ALL: 'C' },
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          reply = {
            code: error ? error.code : 0,
            stdout,
            stderr,
          };
          finish();
        }
      );
      child.once('close', () => {
        closed = true;
        finish();
      });
      const terminate = () => {
        if (closed || escalation !== undefined) {
          return;
        }
        child.kill('SIGTERM');
        escalation = clock.setTimeout(() => {
          trace('force-kill');
          child.kill('SIGKILL');
        }, killAfterMs);
      };
      const cancel = () => {
        trace('cancel');
        terminate();
      };
      const deadline = clock.setTimeout(() => {
        timedOut = true;
        trace('deadline');
        terminate();
      }, deadlineMs);
      signal?.addEventListener('abort', cancel, { once: true });
      // Cancellation may race with spawning or registering the listener.
      if (signal?.aborted) {
        cancel();
      }
      // A failed spawn may close stdin before end(); it is a transport refusal.
      child.stdin?.on('error', () => {});
      child.stdin?.end(input);
    });

export const runRunnerCommand = createRunnerTransport();
