/**
 * VK request pacing and error handling (R-Z8).
 *
 * VK allows 3 requests per second per user token and 20 per second per
 * community token (https://dev.vk.com/en/api/api-requests). A sliding
 * window lets a short burst through and then waits, so a pull of many
 * chats never earns error 6 ("too many requests per second"). If VK
 * answers 6 anyway, the call waits with a growing pause and repeats: error
 * 6 means VK refused before doing anything, so repeating is safe (a send
 * also carries a `random_id`, which VK de-duplicates). After the last try
 * the failure is a plain coded error, never a crash.
 * Captcha (error 14) is never repeated by itself: the user has to solve it.
 */

import { codedError } from './http.js';

export const VK_USER_RPS = 3;
export const VK_COMMUNITY_RPS = 20;

const pause = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

/** A sliding-window limiter: at most `perSecond` starts in any second. */
export const createRateLimiter = ({
  perSecond = VK_USER_RPS,
  now = Date.now,
  sleep = pause,
} = {}) => {
  const starts = [];
  let chain = Promise.resolve();
  const turn = async () => {
    for (;;) {
      const at = now();
      while (starts.length > 0 && at - starts[0] >= 1000) {
        starts.shift();
      }
      if (starts.length < perSecond) {
        starts.push(at);
        return;
      }
      await sleep(Math.max(1, 1000 - (at - starts[0])));
    }
  };
  return {
    perSecond,
    wait() {
      const next = chain.then(turn);
      chain = next.catch(() => {});
      return next;
    },
  };
};

/** The error VK answered with; `captcha` carries what the user must solve. */
export const vkApiError = (payload) => {
  const code = payload.error.error_code ?? 'unknown';
  const message = payload.error.error_msg ?? 'VK API error';
  const error = new Error(`vk API ${code}: ${message}`);
  error.vkCode = code;
  if (Number(code) === 14) {
    Object.assign(error, {
      code: 'captcha',
      fallback: false,
      captchaSid: payload.error.captcha_sid ?? null,
      captchaImg: payload.error.captcha_img ?? null,
    });
  }
  return error;
};

export const isTooMany = (error) => Number(error?.vkCode) === 6;

/**
 * Run `attempt()`; on VK error 6 wait (`pauseMs`, doubling) and repeat up to
 * `tries` times, then give up with a `rate-limited` error.
 */
export const withTooManyBackoff = async (
  attempt,
  { tries = 4, pauseMs = 400, sleep = pause } = {}
) => {
  for (let n = 0; ; n += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (!isTooMany(error)) {
        throw error;
      }
      if (n + 1 >= tries) {
        throw Object.assign(
          codedError(
            'VK is rate limiting this token (error 6); try again in a minute',
            'rate-limited'
          ),
          { vkCode: 6, fallback: false }
        );
      }
      await sleep(pauseMs * 2 ** n);
    }
  }
};

/**
 * `random_id` for messages.send: VK drops a second send with the same
 * (peer, random_id), so a retry of one draft must reuse it. It is derived
 * from the draft's `clientId` / outbox key, as the Telegram sender does.
 * VK takes a 32-bit int; 0 would turn de-duplication off.
 */
export const vkRandomId = (clientId) => {
  if (!clientId) {
    return 1 + Math.floor(Math.random() * 0x7ffffffe);
  }
  // FNV-1a over the text: stable, dependency-free (this file also runs in
  // the browser bundle), 31 bits, never 0.
  let hash = 0x811c9dc5;
  for (const ch of `vk:${clientId}`) {
    hash = Math.imul(hash ^ ch.codePointAt(0), 0x01000193) >>> 0;
  }
  return hash & 0x7fffffff || 1;
};
