/**
 * Groups in common with a person (R-Y158; learned, never copied), as
 * Telegram Desktop lists them from a person's profile:
 * - `commonChats({ chat, maxId? })` — the groups and channels both the
 *   account and the person are in, a page at a time
 *   (messages.getCommonChats) → `{ ok, chats: [{ chat, title, kind,
 *   members }], next }`. `chat` is the marked id (-100N for a supergroup
 *   or channel, -N for a basic group), `kind` 'group' or 'channel',
 *   `members` the count when Telegram says it (else null); `next` is the
 *   `maxId` for the following page (the last chat's own id), or null.
 * Read-only. Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { inputUserOf } from './telegram-peer-actions.js';

const CODES = {
  USER_ID_INVALID: 'no-user',
  PEER_ID_INVALID: 'no-user',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const bad = { ok: false, error: 'bad request', code: 'failed' };
const USER = /^\d{1,20}$/;
export const COMMON_PAGE = 50;

const textOf = (value) => String(value?.value ?? value);

// A chat Telegram sent, as the page lists it; null for one it cannot open.
const chatOf = (raw) => {
  const kind = raw?.className;
  if (kind !== 'Channel' && kind !== 'Chat') {
    return null;
  }
  const id = textOf(raw.id);
  const channel = kind === 'Channel';
  return {
    id,
    chat: channel ? `-100${id}` : `-${id}`,
    title: raw.title ?? '',
    kind: channel && raw.broadcast ? 'channel' : 'group',
    members: raw.participantsCount ?? null,
  };
};

const createCommonChatsRead =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const maxId = String(body.maxId ?? '0');
    if (!USER.test(chat) || !USER.test(maxId)) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `common-chats:${chat}:${maxId}`, () =>
        env.connection.withPeer(c.client, chat, async (peer) =>
          c.client.invoke(
            new c.Api.messages.GetCommonChats({
              userId: await inputUserOf(c, peer),
              maxId: c.helpers.returnBigInt(maxId),
              limit: COMMON_PAGE,
            })
          )
        )
      );
      const found = (answer?.chats ?? []).map(chatOf).filter(Boolean);
      const last = (answer?.chats ?? []).at(-1);
      return {
        ok: true,
        chats: found.map(({ id: _id, ...rest }) => rest),
        next:
          (answer?.chats ?? []).length >= COMMON_PAGE && last
            ? textOf(last.id)
            : null,
      };
    });
  };

export const createCommonChats = (env, context) => ({
  commonChats: createCommonChatsRead(env, context.userClient),
});
