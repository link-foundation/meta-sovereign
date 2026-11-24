import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { encodeWire } from '../transport/lino.js';

const openTerminalInput = () =>
  process.stdin.isTTY
    ? createInterface({ input: process.stdin, terminal: false })
    : null;

const loginControl = (action, service, identity) => {
  if (action === 'attention') {
    return service['login-attention']();
  }
  if (action === 'status') {
    return service['login-status'](identity);
  }
  const match = /^focus\s+(\S+)$/u.exec(action);
  if (match) {
    return service['login-attention-focus']({ ...identity, id: match[1] });
  }
  throw new Error('Use one of the listed commands.');
};

const readLoginControls = async (stream, service, receipt, log, close) => {
  const { requestId, browserSlot } = receipt;
  const identity = { requestId, browserSlot };
  log(
    encodeWire({ commands: ['attention', 'status', 'focus <wait-id>', 'quit'] })
  );
  for await (const line of stream) {
    const action = line.trim();
    if (action === 'quit') {
      close();
      return;
    }
    if (action) {
      try {
        log(encodeWire(await loginControl(action, service, identity)));
      } catch (error) {
        log(
          encodeWire({
            code: error.code ?? 'jobs-login-command',
            error: 'The sign-in command did not complete.',
          })
        );
      }
    }
  }
};

/** Foreground manual login; signals close the owned browser before exit. */
export const foregroundJobLogin = async (
  service,
  input,
  log,
  readInput = openTerminalInput
) => {
  let closing, stream, controls;
  const close = () => {
    stream?.close?.();
    closing ??= (async () => {
      await service.cancel();
      return service['login-status'](input);
    })();
    closing.catch(() => {});
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  try {
    let result = await service['login-open'](input);
    log(encodeWire(result));
    if (result.login?.active && !closing) {
      stream = readInput();
      if (stream) {
        controls = readLoginControls(
          stream,
          service,
          result.login,
          log,
          close
        ).catch(() => {
          log(
            encodeWire({
              code: 'jobs-login-input',
              error: 'The sign-in console could not read from the terminal.',
            })
          );
        });
      }
    }
    while (result.login?.active && !closing) {
      await delay(250);
      result = await service['login-status'](input);
    }
    return closing ? await closing : result;
  } finally {
    process.off('SIGINT', close);
    process.off('SIGTERM', close);
    stream?.close?.();
    await controls;
    await closing;
  }
};
