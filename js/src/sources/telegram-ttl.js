/**
 * A chat's auto-delete timer, and Saved Messages grouped by the chat they
 * came from, as Telegram Desktop has them (R-Y143; learned, never copied):
 *
 * - `setHistoryTtl({ chat, period })` — the chat's timer
 *   (messages.setHistoryTTL); `period` is 0 (off) or one of TTL_PERIODS
 *   in seconds; → `{ ok, period }`;
 * - `savedDialogs({ offsetDate, offsetId, offsetPeer, limit })` — the
 *   Saved Messages "as chats" list (messages.getSavedDialogs), newest
 *   first; → `{ ok, dialogs: [{ peer, name, kind, id, date, preview,
 *   media, pinned }], next, complete }` where `next` is the cursor for
 *   the following page (`{ offsetDate, offsetId, offsetPeer }`);
 * - `savedHistory({ chat, peer, before, limit })` — the messages saved
 *   from one chat (messages.getSavedHistory), oldest first, as the
 *   page's message links of the Saved Messages chat `chat`;
 * - `savedDelete({ peer })` — all of them deleted
 *   (messages.deleteSavedHistory, repeated while Telegram says more).
 * Telegram's errors become codes the page shows as text.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';

// Seconds Telegram takes for an auto-delete timer: off, a day, a week, a
// month (Desktop's list), and the longer ones its "Other" offers.
export const TTL_PERIODS = Object.freeze([
  0, 86_400, 604_800, 2_678_400, 7_776_000, 15_552_000, 31_536_000,
]);

const CODES = {
  TTL_PERIOD_INVALID: 'bad-period',
  CHAT_ADMIN_REQUIRED: 'not-admin',
  CHAT_NOT_MODIFIED: 'unchanged',
  PEER_ID_INVALID: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  USER_BANNED_IN_CHANNEL: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

export const SAVED_PAGE = 30;
const MAX_REPEATS = 20;
const CHAT = /^-?\d{1,20}$/;
const USER = /^\d{1,20}$/;
const BAD = { ok: false, error: 'bad request', code: 'failed' };
const text = (value) => String(value?.value ?? value ?? '');

// A peer's marked id: a person's, -group's, -100channel's.
const markedOf = (peer = {}) => {
  if (peer.userId !== undefined) {
    return text(peer.userId);
  }
  if (peer.chatId !== undefined) {
    return `-${text(peer.chatId)}`;
  }
  return peer.channelId === undefined ? '' : `-100${text(peer.channelId)}`;
};

const nameOf = (entity = {}) =>
  entity.title ||
  [entity.firstName, entity.lastName].filter(Boolean).join(' ') ||
  entity.username ||
  '';

const kindOf = (id) => {
  if (id.startsWith('-100')) {
    return 'channel';
  }
  return id.startsWith('-') ? 'group' : 'user';
};

const MEDIA = {
  MessageMediaPhoto: 'photo',
  MessageMediaDocument: 'file',
  MessageMediaGeo: 'location',
  MessageMediaGeoLive: 'location',
  MessageMediaContact: 'contact',
  MessageMediaPoll: 'poll',
};

const entityOf = (answer, id) => {
  const bare = id.replace(/^-100|^-/, '');
  const list = id.startsWith('-') ? answer.chats : answer.users;
  return (list ?? []).find((e) => text(e.id) === bare) ?? {};
};

// One saved dialog as the page reads it.
const shapeDialog = (answer, dialog) => {
  const peer = markedOf(dialog.peer);
  const top = (answer.messages ?? []).find(
    (m) => Number(m.id) === Number(dialog.topMessage)
  );
  return {
    peer,
    kind: kindOf(peer),
    name: nameOf(entityOf(answer, peer)),
    id: Number(dialog.topMessage) || 0,
    date: top?.date ? Number(top.date) * 1000 : 0,
    preview: String(top?.message ?? '').slice(0, 200),
    media: MEDIA[top?.media?.className] ?? (top?.media ? 'other' : null),
    pinned: Boolean(dialog.pinned),
  };
};

const int = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 2 ** 31 - 1;

const validLimit = (limit) =>
  limit === undefined ||
  (Number.isInteger(limit) && limit >= 1 && limit <= 100);

const validDialogs = (r) =>
  (r.offsetDate === undefined || int(r.offsetDate)) &&
  (r.offsetId === undefined || int(r.offsetId)) &&
  (r.offsetPeer === undefined ||
    r.offsetPeer === '' ||
    CHAT.test(String(r.offsetPeer))) &&
  validLimit(r.limit);

const validHistory = (r) =>
  USER.test(String(r.chat ?? '')) &&
  CHAT.test(String(r.peer ?? '')) &&
  (r.before === undefined || (int(r.before) && r.before > 0)) &&
  validLimit(r.limit);

const usable = (m) => m && m.id !== undefined && m.className !== 'MessageEmpty';

// The cursor after a page: the last dialog, or null at the end.
const cursorOf = (dialogs, limit) => {
  const last = dialogs.at(-1);
  return dialogs.length < limit || !last
    ? null
    : {
        offsetDate: Math.floor(last.date / 1000),
        offsetId: last.id,
        offsetPeer: last.peer,
      };
};

/**
 * `env` is the account's; `userClient()` the user client or null; `tools`
 * brings `toLinks`; `apply(client, result)` runs Telegram's updates.
 */
export const createTtl = (env, { userClient, tools, apply }) => {
  const peerRun = (c, chat, use) =>
    env.connection.withPeer(c.client, String(chat), use);
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));

  const setHistoryTtl = async ({ chat, period } = {}) =>
    !CHAT.test(String(chat ?? '')) || !TTL_PERIODS.includes(period)
      ? BAD
      : doing(`history-ttl:${chat}`, (c) =>
          peerRun(c, chat, async (peer) => {
            const result = await c.client.invoke(
              new c.Api.messages.SetHistoryTTL({ peer, period })
            );
            await apply?.(c.client, result);
            return { ok: true, period };
          })
        );

  const savedDialogs = async (request = {}) => {
    if (!validDialogs(request)) {
      return BAD;
    }
    const limit = request.limit ?? SAVED_PAGE;
    const offsetPeer = String(request.offsetPeer ?? '');
    return doing('saved-dialogs', async (c) => {
      const ask = (peer) =>
        c.client.invoke(
          new c.Api.messages.GetSavedDialogs({
            ...(offsetPeer ? { excludePinned: true } : {}),
            offsetDate: request.offsetDate ?? 0,
            offsetId: request.offsetId ?? 0,
            offsetPeer: peer,
            limit,
            hash: c.zero,
          })
        );
      const answer = offsetPeer
        ? await peerRun(c, offsetPeer, ask)
        : await ask(new c.Api.InputPeerEmpty());
      const dialogs = (answer?.dialogs ?? []).map((d) =>
        shapeDialog(answer, d)
      );
      return {
        ok: true,
        dialogs,
        complete: dialogs.length < limit,
        next: cursorOf(dialogs, limit),
      };
    });
  };

  const savedHistory = async (request = {}) => {
    if (!validHistory(request)) {
      return BAD;
    }
    const size = request.limit ?? SAVED_PAGE;
    return doing(`saved-history:${request.peer}`, (c) =>
      peerRun(c, request.peer, async (input) => {
        const answer = await c.client.invoke(
          new c.Api.messages.GetSavedHistory({
            peer: input,
            offsetId: request.before ?? 0,
            offsetDate: 0,
            addOffset: 0,
            limit: size,
            maxId: 0,
            minId: 0,
            hash: c.zero,
          })
        );
        const messages = [...(answer?.messages ?? [])]
          .filter(usable)
          .sort((a, b) => Number(a.id) - Number(b.id));
        return {
          ok: true,
          messages: tools.toLinks(
            { id: String(request.chat), isUser: true },
            messages
          ),
          complete: messages.length < size,
        };
      })
    );
  };

  const savedDelete = async ({ peer } = {}) =>
    !CHAT.test(String(peer ?? ''))
      ? BAD
      : doing(`saved-delete:${peer}`, (c) =>
          peerRun(c, peer, async (input) => {
            // Telegram deletes in parts: `offset` says how many are left.
            for (let n = 0; n < MAX_REPEATS; n += 1) {
              const part = await c.client.invoke(
                new c.Api.messages.DeleteSavedHistory({ peer: input, maxId: 0 })
              );
              if (!(Number(part?.offset) > 0)) {
                break;
              }
            }
            return { ok: true };
          })
        );

  return { setHistoryTtl, savedDialogs, savedHistory, savedDelete };
};
