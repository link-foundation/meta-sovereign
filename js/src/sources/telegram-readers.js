/**
 * Who read a message and who reacted to it, as Telegram's apps list them
 * (R-Y127; learned, never copied):
 * - `messageReaders({ chat, id })` — in a small group (Telegram decides:
 *   at most 100 members, the message a day or two old at most), the people
 *   who read the user's own message and when (messages.
 *   getMessageReadParticipants) → `{ ok, readers: [{ id, name, date }] }`,
 *   `date` in ms, the latest first;
 * - `messageReactors({ chat, id, emoji?, offset? })` — who reacted, with
 *   which emoji (messages.getMessageReactionsList), a page at a time →
 *   `{ ok, count, items: [{ peer, name, emoji, customEmojiId, date, my }],
 *   next }`, `next` the offset of the following page or null.
 * Telegram's errors (MSG_TOO_OLD, CHAT_TOO_BIG…) become codes the page
 * shows as text.
 */

import { connect, runIn } from './telegram-stickers.js';

const CODES = {
  MSG_TOO_OLD: 'too-old',
  CHAT_TOO_BIG: 'too-big',
  MESSAGE_ID_INVALID: 'not-found',
  CHAT_ADMIN_REQUIRED: 'not-allowed',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
};

const failure = (error) => {
  const name = String(error?.errorMessage ?? error?.message ?? '');
  const key = Object.keys(CODES).find((k) => name.includes(k));
  return { ok: false, error: key ?? 'failed', code: CODES[key] ?? 'failed' };
};

const CHAT = /^-?\d{1,20}$/;
const textOf = (value) => String(value?.value ?? value);
const MAX_READERS = 100;

const nameOf = (entity) =>
  entity?.title ||
  [entity?.firstName, entity?.lastName].filter(Boolean).join(' ') ||
  entity?.username ||
  '';

// A peer's id as the chat list writes it: users plain, groups negative,
// channels -100…
const peerId = (peer) => {
  if (peer?.userId !== undefined) {
    return textOf(peer.userId);
  }
  if (peer?.channelId !== undefined) {
    return `-100${textOf(peer.channelId)}`;
  }
  return peer?.chatId === undefined ? '' : `-${textOf(peer.chatId)}`;
};

// A reader's name: the account may know them already; else their id.
const readerName = async (client, id) => {
  try {
    return nameOf(await client.getEntity(id)) || id;
  } catch {
    return id;
  }
};

const valid = (body) =>
  CHAT.test(String(body.chat ?? '')) && Number(body.id) > 0;

const createReaders =
  (env, userClient) =>
  async (body = {}) => {
    const c = valid(body) ? await connect(env, userClient) : null;
    if (!c) {
      return { ok: false, supported: false };
    }
    try {
      const answer = await runIn(env, `readers:${body.chat}:${body.id}`, () =>
        env.connection.withPeer(c.client, body.chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.GetMessageReadParticipants({
              peer,
              msgId: Number(body.id),
            })
          )
        )
      );
      const found = [...(Array.isArray(answer) ? answer : [])]
        .slice(0, MAX_READERS)
        .sort((a, b) => Number(b.date) - Number(a.date));
      const readers = await Promise.all(
        found.map(async (one) => {
          const user = textOf(one.userId);
          return {
            id: user,
            name: await readerName(c.client, user),
            date: Number(one.date) * 1000,
          };
        })
      );
      return { ok: true, readers };
    } catch (error) {
      return failure(error);
    }
  };

const reactorOf = (one, names) => {
  const peer = peerId(one.peerId);
  const custom = one.reaction?.documentId;
  return {
    peer,
    name: names.get(peer) || peer,
    emoji: one.reaction?.emoticon ?? null,
    customEmojiId: custom === undefined ? null : textOf(custom),
    date: Number(one.date) * 1000,
    my: Boolean(one.my),
  };
};

// The names Telegram sent with the page: users and chats by marked id.
const namesIn = (answer) =>
  new Map([
    ...(answer.users ?? []).map((u) => [textOf(u.id), nameOf(u)]),
    ...(answer.chats ?? []).map((c) => [
      c.className === 'Channel' ? `-100${textOf(c.id)}` : `-${textOf(c.id)}`,
      nameOf(c),
    ]),
  ]);

const createReactors =
  (env, userClient) =>
  async (body = {}) => {
    const c = valid(body) ? await connect(env, userClient) : null;
    if (!c) {
      return { ok: false, supported: false };
    }
    const emoji = String(body.emoji ?? '');
    const offset = String(body.offset ?? '');
    try {
      const answer = await runIn(
        env,
        `reactors:${body.chat}:${body.id}:${emoji}:${offset}`,
        () =>
          env.connection.withPeer(c.client, body.chat, (peer) =>
            c.client.invoke(
              new c.Api.messages.GetMessageReactionsList({
                peer,
                id: Number(body.id),
                limit: 50,
                ...(emoji
                  ? { reaction: new c.Api.ReactionEmoji({ emoticon: emoji }) }
                  : {}),
                ...(offset ? { offset } : {}),
              })
            )
          )
      );
      const names = namesIn(answer ?? {});
      const items = (answer?.reactions ?? []).map((one) =>
        reactorOf(one, names)
      );
      return {
        ok: true,
        count: Number(answer?.count ?? items.length),
        items,
        next: answer?.nextOffset || null,
      };
    } catch (error) {
      return failure(error);
    }
  };

export const createReadersActions = (env, context) => ({
  messageReaders: createReaders(env, context.userClient),
  messageReactors: createReactors(env, context.userClient),
});
