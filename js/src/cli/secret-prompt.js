import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { loginError } from '../sources/telegram-login-lifecycle.js';

// The real terminal owns raw mode; only the label/newline reach output.
export const askTerminalSecret = async (
  label,
  { signal, input = process.stdin, output = process.stdout } = {}
) => {
  if (!input.isTTY) {
    throw loginError('NEEDS_TERMINAL', 'interactive login requires a terminal');
  }
  signal?.throwIfAborted();
  const muted = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const reader = createInterface({ input, output: muted, terminal: true });
  let interrupt;
  let closed;
  const stopped = new Promise((_resolve, reject) => {
    interrupt = () => reject(loginError('LOGIN_CANCELLED', 'login cancelled'));
    closed = () =>
      reject(loginError('TERMINAL_CLOSED', 'terminal input closed'));
    reader.once('SIGINT', interrupt);
    reader.once('close', closed);
  });
  output.write(`${label}: `);
  try {
    return await Promise.race([reader.question('', { signal }), stopped]);
  } finally {
    reader.removeListener('SIGINT', interrupt);
    reader.removeListener('close', closed);
    reader.close();
    muted.end();
    output.write('\n');
  }
};
