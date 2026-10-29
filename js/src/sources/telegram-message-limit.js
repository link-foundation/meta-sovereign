import { MAX_MESSAGE_LENGTH } from './telegram-send.js';

// Optional server configuration must not hold a user's send behind a lost RPC.
const limits = new WeakMap();
export const messageLengthMax = async (
  client,
  Api,
  {
    timeoutMs = 1000,
    setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimer = (timer) => globalThis.clearTimeout(timer),
  } = {}
) => {
  if (!limits.has(client)) {
    limits.set(
      client,
      Api?.help?.GetConfig && typeof client.invoke === 'function'
        ? Promise.resolve()
            .then(() => client.invoke(new Api.help.GetConfig()))
            .then((config) => Number(config?.messageLengthMax) || null)
            .catch(() => null)
        : Promise.resolve(null)
    );
  }
  let timer;
  try {
    const value = await Promise.race([
      limits.get(client),
      new Promise((resolve) => {
        timer = setTimer(() => resolve(null), timeoutMs);
      }),
    ]);
    return value ?? MAX_MESSAGE_LENGTH;
  } finally {
    clearTimer(timer);
  }
};
