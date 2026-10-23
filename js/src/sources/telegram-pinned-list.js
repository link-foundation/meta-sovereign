/**
 * A chat's pinned messages as a list, and "Unpin all", as Telegram
 * Desktop has them (R-Y166; learned, never copied):
 * - `pinnedList({ chat, topMsgId?, offsetId? })` — the chat's pinned
 *   messages (messages.search with InputMessagesFilterPinned), newest
 *   first, a page at a time → `{ ok, messages, count, next }`: the messages
 *   as the history's links, `count` how many Telegram says are pinned,
 *   `next` the id to ask again with (null at the end). `topMsgId` is a
 *   forum topic's id.
 * - `unpinAll({ chat, topMsgId? })` — every pinned message (in the topic)
 *   unpinned (messages.unpinAllMessages, asked again while Telegram says
 *   there is more) → `{ ok }`.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'no-right',
  CHAT_NOT_MODIFIED: 'none',
  MESSAGE_ID_INVALID: 'not-found',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

export const PINNED_PAGE = 50;
const MAX_ROUNDS = 20;
const CHAT = /^-?\d{1,20}$/;
const DIGITS = /^\d{1,12}$/;
const BAD = { ok: false, error: 'bad request', code: 'failed' };

/** Whether a request body names a chat, optionally a topic and a page. */
export const validPinnedRequest = (body = {}) =>
  CHAT.test(String(body.chat ?? '')) &&
  [body.topMsgId, body.offsetId].every(
    (n) => n === undefined || DIGITS.test(String(n))
  );

const usable = (m) => m && m.id !== undefined && m.className !== 'MessageEmpty';

export const createPinnedList = (env, { userClient, dialogOf, tools }) => {
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));

  const search = (c, { chat, top, offsetId }) =>
    env.connection.withPeer(c.client, chat, (peer) =>
      c.client.invoke(
        new c.Api.messages.Search({
          peer,
          q: '',
          ...(top ? { topMsgId: top } : {}),
          filter: new c.Api.InputMessagesFilterPinned(),
          minDate: 0,
          maxDate: 0,
          offsetId,
          addOffset: 0,
          limit: PINNED_PAGE,
          maxId: 0,
          minId: 0,
          hash: c.zero,
        })
      )
    );

  const pinnedList = async (body = {}) => {
    if (!validPinnedRequest(body)) {
      return BAD;
    }
    const { chat } = body;
    const top = Number(body.topMsgId ?? 0);
    const offsetId = Number(body.offsetId ?? 0);
    return doing(`pinned-list:${chat}:${top}:${offsetId}`, async (c) => {
      const answer = await search(c, { chat, top, offsetId });
      const found = [...(answer?.messages ?? [])].filter(usable);
      const ordered = found.sort((a, b) => Number(b.id) - Number(a.id));
      return {
        ok: true,
        messages: tools.toLinks(await dialogOf(chat), ordered),
        count: Number(answer?.count ?? found.length) || found.length,
        next: found.length >= PINNED_PAGE ? Number(ordered.at(-1).id) : null,
      };
    });
  };

  const unpinAll = async (body = {}) => {
    if (!validPinnedRequest(body)) {
      return BAD;
    }
    const top = Number(body.topMsgId ?? 0);
    return doing(`unpin-all:${body.chat}:${top}`, async (c) => {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const done = await env.connection.withPeer(
          c.client,
          body.chat,
          (peer) =>
            c.client.invoke(
              new c.Api.messages.UnpinAllMessages({
                peer,
                ...(top ? { topMsgId: top } : {}),
              })
            )
        );
        if (!Number(done?.offset ?? 0)) {
          break;
        }
      }
      return { ok: true };
    });
  };

  return { pinnedList, unpinAll };
};
