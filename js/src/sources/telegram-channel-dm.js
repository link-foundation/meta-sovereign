/**
 * Channel direct messages and suggested posts, as Telegram Desktop and the
 * official apps have them (R-Y191; learned, never copied). A channel may
 * link a monoforum: a chat where each subscriber has a thread with the
 * channel's admins. Everything here is asked by the page, a write only on
 * its own click.
 *
 * - `channelDmThreads({ chat })` — the admin's list of threads
 *   (messages.getSavedDialogs with `parent_peer` = the monoforum) →
 *   `{ ok, threads: [{ peer, name, unread, top, at, last, free }] }`;
 * - `channelDmHistory({ chat, peer?, before?, limit? })` — a thread's
 *   messages, oldest first: with `peer` (an admin) messages.getSavedHistory
 *   with `parent_peer` and `peer` = the subscriber; without (a subscriber)
 *   messages.getHistory of the monoforum → `{ ok, messages, complete }`;
 * - `channelDmSend({ chat, text, peer?, stars?, suggestedPost?, clientId? })`
 *   — messages.sendMessage into the monoforum: an admin's reply names the
 *   thread with `InputReplyToMonoForum`; `stars` is the price the sender
 *   accepts for one message (`allow_paid_stars`); `suggestedPost` = `{
 *   stars, scheduleDate? }` is a subscriber's suggestion of a post;
 * - `channelDmDecide({ chat, id, approve, scheduleDate?, comment? })` —
 *   messages.toggleSuggestedPostApproval: an admin accepts a suggested
 *   post, or rejects it with an optional comment.
 * Telegram's errors become codes the page shows as words.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { randomIdOf } from './telegram-send.js';
import { dmMessageOf, namesOf, threadOf } from './telegram-channel-dm-shape.js';

const CODES = {
  ALLOW_PAYMENT_REQUIRED: 'payment-required',
  BALANCE_TOO_LOW: 'balance',
  CHAT_ADMIN_REQUIRED: 'admin-required',
  CHAT_WRITE_FORBIDDEN: 'write-forbidden',
  USER_BANNED_IN_CHANNEL: 'write-forbidden',
  MESSAGE_ID_INVALID: 'gone',
  SCHEDULE_DATE_INVALID: 'bad-date',
  SUGGESTED_POST_PEER_INVALID: 'not-allowed',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  MESSAGE_TOO_LONG: 'too-long',
  MESSAGE_EMPTY: 'empty',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);

const CHANNEL = /^-100\d{1,15}$/;
const USER = /^\d{1,20}$/;
const bad = { ok: false, error: 'bad request', code: 'bad-request' };
const PAGE = 50;

const positive = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const byId = (messages) =>
  new Map(messages.map((m) => [Number(m.id), m]).filter(([id]) => id > 0));

const shown = (messages) =>
  [...(messages ?? [])].filter(
    (m) => m && m.id !== undefined && m.className !== 'MessageEmpty'
  );

// The request that sends a message into the monoforum: an admin's reply
// names the thread (`reply`, the subscriber's input peer), a price paid
// goes as `allow_paid_stars`, a suggestion as `suggested_post`.
const sendRequest = (c, { parent, text, reply, stars, post, clientId }) =>
  new c.Api.messages.SendMessage({
    peer: parent,
    message: text,
    randomId: randomIdOf(clientId, 0, c.helpers),
    ...(reply
      ? {
          replyTo: new c.Api.InputReplyToMonoForum({
            monoforumPeerId: reply,
          }),
        }
      : {}),
    ...(positive(stars)
      ? { allowPaidStars: c.helpers.returnBigInt(stars) }
      : {}),
    ...(post
      ? {
          suggestedPost: new c.Api.SuggestedPost({
            price: new c.Api.StarsAmount({
              amount: c.helpers.returnBigInt(positive(post.stars) ?? 0),
              nanos: 0,
            }),
            ...(positive(post.scheduleDate)
              ? { scheduleDate: post.scheduleDate }
              : {}),
          }),
        }
      : {}),
  });

// The thread's messages: an admin's (saved history of the subscriber under
// the monoforum), else the subscriber's own (the monoforum's history).
const historyRequest = (c, { parent, subscriber, before }) => {
  const page = {
    offsetId: positive(before) ?? 0,
    offsetDate: 0,
    addOffset: 0,
    limit: PAGE,
    maxId: 0,
    minId: 0,
    hash: c.zero,
  };
  return subscriber
    ? new c.Api.messages.GetSavedHistory({
        parentPeer: parent,
        peer: subscriber,
        ...page,
      })
    : new c.Api.messages.GetHistory({ peer: parent, ...page });
};

const decideRequest = (c, { parent, id, approve, scheduleDate, comment }) =>
  new c.Api.messages.ToggleSuggestedPostApproval({
    peer: parent,
    msgId: positive(id),
    ...(approve ? {} : { reject: true }),
    ...(approve && positive(scheduleDate) ? { scheduleDate } : {}),
    ...(!approve && String(comment ?? '').trim()
      ? { rejectComment: String(comment).trim() }
      : {}),
  });

const validChat = (chat) => CHANNEL.test(String(chat ?? ''));
const validPeer = (peer) => peer === null || USER.test(String(peer));

export const createChannelDm = (env, { userClient }) => {
  // Subscribers' input peers, as the last list or history gave them.
  const known = new Map();

  const rememberUsers = (c, chat, users) => {
    for (const user of users ?? []) {
      if (user?.id !== undefined && user.accessHash !== undefined) {
        known.set(
          `${chat}:${user.id}`,
          new c.Api.InputPeerUser({
            userId: user.id,
            accessHash: user.accessHash,
          })
        );
      }
    }
  };

  const subscriberOf = async (c, chat, peer) =>
    peer === null
      ? null
      : (known.get(`${chat}:${peer}`) ??
        (await env.connection.withPeer(c.client, String(peer), (p) => p)));

  // `use(c, parent)` on the monoforum's peer, through the queue.
  const inMonoforum = (c, chat, name, use) =>
    runIn(env, `${name}:${chat}`, () =>
      env.connection.withPeer(c.client, String(chat), (parent) => use(parent))
    );

  const threads = async ({ chat } = {}) =>
    !validChat(chat)
      ? bad
      : connected(env, userClient, failure, async (c) => {
          const answer = await inMonoforum(c, chat, 'channel-dm', (parent) =>
            c.client.invoke(
              new c.Api.messages.GetSavedDialogs({
                parentPeer: parent,
                offsetDate: 0,
                offsetId: 0,
                offsetPeer: new c.Api.InputPeerEmpty(),
                limit: 100,
                hash: c.zero,
              })
            )
          );
          rememberUsers(c, String(chat), answer?.users);
          const names = namesOf(answer?.users);
          const messages = byId(shown(answer?.messages));
          return {
            ok: true,
            threads: (answer?.dialogs ?? [])
              .map((d) => threadOf(d, messages, names))
              .filter(Boolean),
          };
        });

  const history = async ({ chat, peer = null, before = null } = {}) =>
    !validChat(chat) || !validPeer(peer)
      ? bad
      : connected(env, userClient, failure, async (c) => {
          const answer = await inMonoforum(
            c,
            chat,
            'channel-dm-history',
            async (parent) =>
              c.client.invoke(
                historyRequest(c, {
                  parent,
                  subscriber: await subscriberOf(c, String(chat), peer),
                  before,
                })
              )
          );
          const names = namesOf(answer?.users);
          const list = shown(answer?.messages);
          return {
            ok: true,
            messages: list
              .map((m) => dmMessageOf(m, names))
              .sort((a, b) => a.id - b.id),
            complete: list.length < PAGE,
          };
        });

  const send = async ({
    chat,
    text,
    peer = null,
    stars = null,
    suggestedPost = null,
    clientId,
  } = {}) =>
    !validChat(chat) ||
    typeof text !== 'string' ||
    text.trim() === '' ||
    !validPeer(peer)
      ? bad
      : connected(env, userClient, failure, async (c) => {
          const sent = await inMonoforum(
            c,
            chat,
            'channel-dm-send',
            async (parent) =>
              c.client.invoke(
                sendRequest(c, {
                  parent,
                  text,
                  reply: await subscriberOf(c, String(chat), peer),
                  stars,
                  post: suggestedPost,
                  clientId,
                })
              )
          );
          env.catchUp?.observeResult?.(sent);
          return { ok: true };
        });

  const decide = async ({ chat, id, approve, ...rest } = {}) =>
    !validChat(chat) || !positive(id) || typeof approve !== 'boolean'
      ? bad
      : connected(env, userClient, failure, async (c) => {
          await inMonoforum(c, chat, 'channel-dm-decide', (parent) =>
            c.client.invoke(decideRequest(c, { parent, id, approve, ...rest }))
          );
          return { ok: true, approved: approve };
        });

  return {
    channelDmThreads: threads,
    channelDmHistory: history,
    channelDmSend: send,
    channelDmDecide: decide,
  };
};
