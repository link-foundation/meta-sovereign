import { execFile } from 'node:child_process';

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

/** Keep remote argv out of ssh's command string; send a quoted script on stdin. */
export const runnerInvocation = (target, argv) =>
  target.host
    ? {
        file: 'ssh',
        args: ['-T', '-o', 'BatchMode=yes', '--', target.host, 'sh -s'],
        input: `set -eu\nexport LC_ALL=C\ncd ${quote(target.directory)}\nexec ${argv.map(quote).join(' ')}\n`,
      }
    : { file: argv[0], args: argv.slice(1), cwd: target.directory };

/** Bound captured output and wait for child completion, including cancellation. */
export const runRunnerCommand = (target, argv, { signal } = {}) =>
  new Promise((resolve) => {
    const { file, args, cwd, input } = runnerInvocation(target, argv);
    let reply;
    let closed = false;
    const finish = () => {
      if (closed && reply) {
        resolve(reply);
      }
    };
    const child = execFile(
      file,
      args,
      {
        cwd,
        signal,
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
          aborted: signal?.aborted === true,
        };
        finish();
      }
    );
    child.once('close', () => {
      closed = true;
      finish();
    });
    // A failed spawn may close stdin before end(); it is a transport refusal.
    child.stdin?.on('error', () => {});
    child.stdin?.end(input);
  });
