import { setTimeout as delay } from 'node:timers/promises';
import { encodeWire } from '../transport/lino.js';

/** Foreground manual login; signals close the owned browser before exit. */
export const foregroundJobLogin = async (service, input, log) => {
  let closing;
  const close = () => {
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
    while (result.login?.active && !closing) {
      await delay(250);
      result = await service['login-status'](input);
    }
    return closing ? await closing : result;
  } finally {
    process.off('SIGINT', close);
    process.off('SIGTERM', close);
    await closing;
  }
};
