import { floodSeconds } from '../sources/telegram-history.js';
import { json } from './util.js';

// A Telegram rate limit is a recoverable wait, with a usable retry time.
export const telegramRouteError = (res, path, error, log) => {
  const wait =
    floodSeconds(error) ||
    (error.code === 'flood-wait' ? Number(error.retryAfter) : 0);
  const code = wait ? 'flood-wait' : error.code;
  log?.({
    level: wait ? 'warn' : 'error',
    event: wait ? 'telegram_route_waits' : 'telegram_route_failed',
    path,
    error: error.message,
    code: code ?? null,
    ...(wait ? { retryAfter: wait } : {}),
  });
  if (wait) {
    res.setHeader('retry-after', String(Math.ceil(wait)));
  }
  json(res, wait ? 429 : 502, {
    error: error.message,
    code,
    ...(wait || error.retryAfter
      ? { retryAfter: wait || error.retryAfter }
      : {}),
  });
  return true;
};
