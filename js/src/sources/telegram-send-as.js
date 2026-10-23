/**
 * "Send as", as Telegram Desktop has it (R-Y141; learned, never copied):
 * in a supergroup (and a channel's discussion group) the small avatar
 * button left of the box chooses which identity sends.
 * - `sendAsList({ chat })` — who may send in the chat (channels.getSendAs)
 *   and who does by default (channels.getFullChannel → defaultSendAs, else
 *   the user) → `{ ok, current, peers: [{ id, kind, name, username?,
 *   count?, premium? }], premium }`; kept per chat for a few minutes.
 *   `kind` is `user`, `channel` or `group`; `premium` on a peer says
 *   Premium is required to send as it, `premium` on the answer that the
 *   user has it;
 * - `sendAsSave({ chat, sendAs })` — the choice kept by Telegram
 *   (messages.saveDefaultSendAs).
 * `withSendAs(env, client, id)` is what every send path uses: the client
 * whose send requests (messages.sendMessage, sendMedia, sendMultiMedia,
 * sendInlineBotResult — also those GramJS builds inside sendFile) carry
 * `send_as`. Telegram's refusals become codes the page shows as text.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';
import { inputOf, rememberInputs } from './telegram-send-as-client.js';

const CODES = {
  SEND_AS_PEER_INVALID: 'send-as-invalid',
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  CHAT_ADMIN_REQUIRED: 'no-rights',
  CHANNEL_PRIVATE: 'no-access',
  PEER_ID_INVALID: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

const SUPERGROUP = /^-100\d{1,15}$/;
const PEER_ID = /^-?\d{1,20}$/;
const KEEP_MS = 3 * 60_000;
const text = (value) => String(value ?? '');

// A Telegram peer as our chat id and kind.
const peerId = (peer) => {
  switch (peer?.className) {
    case 'PeerUser':
      return { id: text(peer.userId), kind: 'user' };
    case 'PeerChannel':
      return { id: `-100${text(peer.channelId)}`, kind: 'channel' };
    case 'PeerChat':
      return { id: `-${text(peer.chatId)}`, kind: 'group' };
    default:
      return null;
  }
};

const nameOf = (entity) =>
  entity?.title ??
  ([entity?.firstName, entity?.lastName].filter(Boolean).join(' ') ||
    entity?.username ||
    '');

// The entity a peer names, among the answer's users and chats.
const entityOf = (answer, peer) => {
  const key = peer?.userId ?? peer?.channelId ?? peer?.chatId;
  const list = peer?.userId ? answer.users : answer.chats;
  return (list ?? []).find((e) => text(e.id) === text(key));
};

const shapePeer = (answer, one) => {
  const peer = peerId(one.peer);
  if (!peer) {
    return null;
  }
  const entity = entityOf(answer, one.peer);
  const count = Number(entity?.participantsCount);
  return {
    ...peer,
    name: nameOf(entity),
    ...(entity?.username ? { username: text(entity.username) } : {}),
    ...(Number.isFinite(count) && count > 0 ? { count } : {}),
    ...(one.premiumRequired ? { premium: true } : {}),
  };
};

// The input peers an answer names, to send as them without a lookup.
const inputsOf = (c, answer) => {
  const found = new Map();
  for (const user of answer.users ?? []) {
    found.set(
      text(user.id),
      new c.Api.InputPeerUser({
        userId: user.id,
        accessHash: user.accessHash ?? c.zero,
      })
    );
  }
  for (const chat of answer.chats ?? []) {
    if (chat.className === 'Channel') {
      found.set(
        `-100${text(chat.id)}`,
        new c.Api.InputPeerChannel({
          channelId: chat.id,
          accessHash: chat.accessHash ?? c.zero,
        })
      );
    }
  }
  return found;
};

export const createSendAs = (env, { userClient }) => {
  const kept = new Map(); // chat -> { at, answer }
  const now = () => (env.now ?? Date.now)();

  const defaultOf = async (c, peer) => {
    const full = await c.client.invoke(
      new c.Api.channels.GetFullChannel({ channel: peer })
    );
    return peerId(full?.fullChat?.defaultSendAs)?.id ?? null;
  };

  const premiumOf = async (c) =>
    Boolean((await c.client.getMe?.().catch(() => null))?.premium);

  const ask = (c, chat) =>
    runIn(env, `send-as:${chat}`, () =>
      env.connection.withPeer(c.client, chat, async (peer) => {
        const answer = await c.client.invoke(
          new c.Api.channels.GetSendAs({ peer })
        );
        const peers = (answer?.peers ?? [])
          .map((one) => shapePeer(answer, one))
          .filter(Boolean);
        const saved = peers.length > 1 ? await defaultOf(c, peer) : null;
        rememberInputs(c.client, inputsOf(c, answer));
        return {
          ok: true,
          current: saved ?? peers.find((p) => p.kind === 'user')?.id ?? null,
          peers,
          premium: peers.length > 1 ? await premiumOf(c) : false,
        };
      })
    );

  const sendAsList = async ({ chat } = {}) => {
    if (!SUPERGROUP.test(text(chat))) {
      return { ok: false, supported: false };
    }
    const hit = kept.get(chat);
    if (hit && now() - hit.at < KEEP_MS) {
      return hit.answer;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await ask(c, chat);
      kept.set(chat, { at: now(), answer });
      return answer;
    });
  };

  const sendAsSave = async ({ chat, sendAs } = {}) => {
    if (!SUPERGROUP.test(text(chat)) || !PEER_ID.test(text(sendAs))) {
      return { ok: false, supported: false };
    }
    return connected(env, userClient, failure, async (c) => {
      const as = await inputOf(env, c.client, text(sendAs));
      await runIn(env, `send-as-save:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.SaveDefaultSendAs({ peer, sendAs: as })
          )
        )
      );
      const hit = kept.get(chat);
      if (hit) {
        hit.answer = { ...hit.answer, current: text(sendAs) };
      }
      return { ok: true, current: text(sendAs) };
    });
  };

  return { sendAsList, sendAsSave };
};
