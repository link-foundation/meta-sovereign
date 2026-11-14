import { TELEGRAM_CALLS } from './dom-telegram-calls.js';
import { telegramFeatureAvailable } from './telegram-capabilities.js';
import { debugBrowser } from './client-log.js';

const unavailable = async (readStatus, feature) => {
  const status = await Promise.resolve()
    .then(readStatus)
    .catch(() => ({ offline: true }));
  if (telegramFeatureAvailable(status, feature)) {
    return null;
  }
  const answer = {
    ok: false,
    unsupported:
      status?.available === false || status?.capabilities?.[feature] === false,
    offline: Boolean(status?.offline),
  };
  debugBrowser('telegram-operation-unavailable', { feature, ...answer });
  return answer;
};

export const createTelegramCalls = ({ post, readStatus }) =>
  Object.fromEntries(
    Object.entries(TELEGRAM_CALLS).map(([name, call]) => [
      name,
      async (body = {}) => {
        if (call.capability) {
          const answer = await unavailable(readStatus, call.capability);
          if (answer) {
            return answer;
          }
        }
        return post(call.route, call.body ? body : {});
      },
    ])
  );
