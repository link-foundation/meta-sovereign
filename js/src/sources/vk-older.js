/**
 * Scroll-back for a VK chat (R-Z20): when the reader reaches the top the page
 * asks for the page before its oldest message (`start_message_id` + `offset`
 * 1), through the same paced client as the pulls (./vk-limits.js). Messages
 * already stored are not written again, and an empty page marks the chat
 * finished (`history:vk:<peer>`, written after the page was stored), so
 * nothing asks past the beginning. A captcha (error 14) is thrown to the
 * page, which asks the user; the same request is then repeated once with
 * `captcha_sid` and `captcha_key` -- never solved by the program. The same
 * request made twice at once (two scroll events) is one request to VK.
 */

import { putAll } from '../storage/universal.js';
import { stamp } from './vk-longpoll.js';

const SOURCE = 'vk';
export const OLDER_PAGE = 50;

export const vkHistoryId = (peerId) => `history:vk:${peerId}`;

const olderNow = async (
  { store, context },
  { peerId, before = null, captchaSid, captchaKey }
) => {
  const mark = vkHistoryId(peerId);
  if ((await store.get(mark))?.complete) {
    return { imported: 0, complete: true, cached: true };
  }
  const { live } = await context();
  const page = await live.pullMessages({
    peerId,
    count: OLDER_PAGE,
    ...(before ? { startMessageId: before, offset: 1 } : {}),
    captchaSid,
    captchaKey,
  });
  const fresh = [];
  for (const link of stamp(page.links)) {
    if (!(await store.get(link.id))) {
      fresh.push(link);
    }
  }
  await putAll(store, fresh);
  const complete = page.rawCount === 0;
  if (complete) {
    await store.put({
      id: mark,
      source: SOURCE,
      chat: String(peerId),
      complete: true,
      tokens: ['history', SOURCE, String(peerId)],
      children: [],
    });
  }
  return { imported: fresh.length, complete };
};

/** `older({ peerId, before?, captchaSid?, captchaKey? })` -> { imported, complete }. */
export const createVkOlder = (env) => {
  const asking = new Map();
  return (request) => {
    const key = JSON.stringify([
      request.peerId,
      request.before ?? null,
      request.captchaSid ?? null,
    ]);
    if (!asking.has(key)) {
      asking.set(
        key,
        olderNow(env, request).finally(() => asking.delete(key))
      );
    }
    return asking.get(key);
  };
};
