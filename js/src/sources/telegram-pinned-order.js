/**
 * Reordering the pinned chats, as Telegram Desktop lets the user drag
 * them (R-Y159; learned, never copied):
 *
 * - `reorderPinned({ folder, chats })` — messages.reorderPinnedDialogs
 *   with `force`, for the main list (folder 0) or the Archive (folder 1);
 *   `chats` are all the pinned chats of that folder, first on top. A
 *   chat Telegram has pinned there that the request leaves out is added
 *   at the end, so `force` never unpins one by accident. Telegram's
 *   answer is then written as the update the other devices get, through
 *   the live handler, so the list keeps that order (the pinned rank, not
 *   the date).
 * Telegram's errors become codes the page shows as text.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';
import { peerOfChat } from './telegram-dialogs.js';

const CODES = {
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  PINNED_DIALOGS_TOO_MUCH: 'too-many',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const CHAT = /^-?\d{1,20}$/;
const BAD = { ok: false, error: 'bad request', code: 'failed' };

/** At most this many chats in one request. */
export const MAX_PINNED = 100;

/** Whether `chats` is a list of distinct, valid chat ids (at most 100). */
export const validOrder = (chats) =>
  Array.isArray(chats) &&
  chats.length > 0 &&
  chats.length <= MAX_PINNED &&
  chats.every((c) => typeof c === 'string' && CHAT.test(c)) &&
  new Set(chats).size === chats.length;

// The input peer of a chat, whichever form the connection gives.
const inputOf = (env, c, chat) =>
  env.connection.withPeer(c.client, chat, async (peer) =>
    typeof peer === 'object' ? peer : await c.client.getInputEntity(peer)
  );

// The chats pinned in the folder that the request leaves out.
const pinnedElsewhere = async (env, folder, chats) => {
  const rows =
    (await env.store?.query?.(
      (l) =>
        l?.kind === 'read' &&
        l.source === 'telegram' &&
        Number(l.pinnedRank ?? 0) > 0 &&
        (Number(l.folder ?? 0) === 1 ? 1 : 0) === folder
    )) ?? [];
  return [...rows]
    .sort((a, b) => a.pinnedRank - b.pinnedRank)
    .map((l) => String(l.chat))
    .filter((chat) => !chats.includes(chat));
};

export const createPinnedOrder = (env, { userClient }) => ({
  /** `{ folder, chats }` → `{ ok, folder, chats }`. */
  reorderPinned: async ({ folder, chats } = {}) => {
    if ((folder !== 0 && folder !== 1) || !validOrder(chats)) {
      return BAD;
    }
    return connected(env, userClient, failure, async (c) => {
      const order = [...chats, ...(await pinnedElsewhere(env, folder, chats))];
      return await runIn(env, `pinned-order:${folder}`, async () => {
        const peers = [];
        for (const chat of order) {
          peers.push(
            new c.Api.InputDialogPeer({ peer: await inputOf(env, c, chat) })
          );
        }
        await c.client.invoke(
          new c.Api.messages.ReorderPinnedDialogs({
            force: true,
            folderId: folder,
            order: peers,
          })
        );
        await env.live?.handle?.(c.client, {
          className: 'UpdatePinnedDialogs',
          folderId: folder,
          order: order.map((chat) => ({
            className: 'DialogPeer',
            peer: peerOfChat(chat),
          })),
        });
        return { ok: true, folder, chats: order };
      });
    });
  },
});
