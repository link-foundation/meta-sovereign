/**
 * Inline bots in the message box, as Telegram Desktop's (R-Y138;
 * learned, never copied): `@gif cats` asks the bot @gif for answers.
 *
 * - `inlineBot({ username })` — the bot behind a name
 *   (contacts.resolveUsername); only a bot with an inline placeholder
 *   counts → `{ ok, bot: { id, username, name, placeholder } }`, else
 *   code `not-inline` (a user, or a bot without inline mode) or `no-bot`;
 * - `inlineResults({ chat, username, query, offset })` — the bot's
 *   answers for the words, in this chat (messages.getInlineBotResults),
 *   a page at a time → `{ ok, bot, queryId, gallery, results: [{ id,
 *   type, title, description, doc }], next, switchPm, switchWebview }`.
 *   A result with a file (GIF, sticker, video) has `doc`, a panel item
 *   whose picture the sticker route serves; a photo or a result that
 *   only names a web address has none — the page never loads another
 *   site's address, and this server fetches none either;
 * - `inlineSend({ chat, queryId, id, replyTo, clientId, sendAs })` — one
 *   answer sent (messages.sendInlineBotResult, as the chat's picked "send
 *   as" identity when `sendAs` names one, R-Y147); only an answer this
 *   module gave in that chat; Telegram's reply goes through the live
 *   handler;
 * - `inlineStartBot({ username, startParam })` — the "switch to PM" button
 *   above the results (messages.startBot: bot, peer = the bot, randomId,
 *   startParam; R-Y147); only a start parameter that bot's answer offered.
 *
 * Bots are kept ten minutes, answers as long as the bot says
 * (`cacheTime`, at most five minutes). Telegram's errors become codes.
 */

import { connect, failureOf, runIn } from './telegram-stickers.js';
import { randomIdOf, replyHeader } from './telegram-send.js';
import { withSendAs } from './telegram-send-as-client.js';

const BOT_MS = 10 * 60_000;
const MAX_CACHE_S = 300;
const KEEP = 40;
const SENDABLE_MS = 60 * 60_000;

export const NAME = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;
export const MAX_QUERY = 256;
export const MAX_OFFSET = 256;
export const MAX_RESULT_ID = 128;

const CODES = {
  BOT_INLINE_DISABLED: 'bot-inline-disabled',
  BOT_RESPONSE_TIMEOUT: 'bot-timeout',
  BOT_INVALID: 'no-bot',
  USERNAME_NOT_OCCUPIED: 'no-bot',
  USERNAME_INVALID: 'no-bot',
  CHAT_SEND_INLINE_FORBIDDEN: 'inline-forbidden',
  CHAT_SEND_GIFS_FORBIDDEN: 'inline-forbidden',
  CHAT_SEND_STICKERS_FORBIDDEN: 'inline-forbidden',
  CHAT_SEND_MEDIA_FORBIDDEN: 'inline-forbidden',
  CHAT_WRITE_FORBIDDEN: 'write-forbidden',
  USER_BANNED_IN_CHANNEL: 'write-forbidden',
  QUERY_ID_INVALID: 'expired',
  RESULT_ID_INVALID: 'expired',
  RESULT_ID_DUPLICATE: 'expired',
  FLOOD_WAIT: 'flood-wait',
  SLOWMODE_WAIT: 'flood-wait',
  CHANNEL_PRIVATE: 'no-access',
  PEER_ID_INVALID: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  SEND_AS_PEER_INVALID: 'send-as-invalid',
  PREMIUM_ACCOUNT_REQUIRED: 'send-as-invalid',
  BOT_START_PARAM_INVALID: 'expired',
  BOT_PRIVACY_EXPIRED: 'expired',
};

const CHAT = /^-?\d{1,20}$/;
const QUERY_ID = /^-?\d{1,20}$/;

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

/** The bot a name stands for (its user), or null for anything else. */
export const resolveBotUser = async (c, username) => {
  const answer = await c.client.invoke(
    new c.Api.contacts.ResolveUsername({ username })
  );
  return (answer?.users ?? []).find((u) => u?.bot) ?? null;
};

/** A user as the input a request names a bot by. */
export const inputBot = (c, user) =>
  new c.Api.InputUser({ userId: user.id, accessHash: user.accessHash });

const nameOf = (user) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') ||
  String(user.username ?? '');

const botInfo = (user, username) => ({
  id: text(user.id),
  username: String(user.username ?? username),
  name: nameOf(user),
  placeholder: String(user.botInlinePlaceholder),
});

const switchOf = (answer) => ({
  switchPm: answer.switchPm
    ? {
        text: String(answer.switchPm.text ?? ''),
        startParam: String(answer.switchPm.startParam ?? ''),
      }
    : null,
  switchWebview: answer.switchWebview
    ? {
        text: String(answer.switchWebview.text ?? ''),
        url: String(answer.switchWebview.url ?? ''),
      }
    : null,
});

const shapeResult = (result, lists, from, queryId) => {
  const media = result?.className === 'BotInlineMediaResult';
  const doc = media && result.document?.className === 'Document';
  return {
    id: String(result.id ?? ''),
    // Each page has its own query: a result is sent with the page's.
    queryId,
    type: String(result.type ?? ''),
    title: String(result.title ?? ''),
    description: String(result.description ?? ''),
    doc: doc
      ? (lists.remember(
          [result.document],
          from,
          result.type === 'gif' ? 'gif' : 'sticker'
        )[0] ?? null)
      : null,
  };
};

// A small map with the oldest dropped first.
const createKeeper = () => {
  const map = new Map();
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.delete(key);
      map.set(key, value);
      while (map.size > KEEP) {
        map.delete(map.keys().next().value);
      }
      return value;
    },
  };
};

// The bot's answer as the page gets it; what it may send is kept.
const shapeAnswer = ({
  answer,
  user,
  name,
  request,
  lists,
  now,
  sendable,
  offered,
}) => {
  const from = `inline:${JSON.stringify(request)}`;
  const queryId = text(answer.queryId);
  const results = (answer.results ?? [])
    .filter((r) => r?.id !== undefined)
    .map((r) => shapeResult(r, lists, from, queryId));
  if (answer.switchPm) {
    offered.set(
      `${name.toLowerCase()}:${String(answer.switchPm.startParam ?? '')}`,
      true
    );
  }
  sendable.set(queryId, {
    at: now(),
    chat: request[0],
    ids: new Set(results.map((r) => r.id)),
  });
  return {
    ok: true,
    bot: botInfo(user, name),
    queryId,
    gallery: Boolean(answer.gallery),
    results,
    next: answer.nextOffset ? String(answer.nextOffset) : null,
    ...switchOf(answer),
  };
};

// "Switch to PM" (R-Y147): messages.startBot with a parameter the bot's
// own answer offered, in the bot's private chat.
const createStartBot =
  ({ guarded, botOf, offered, run, apply }) =>
  async ({ username, startParam } = {}) => {
    const name = String(username ?? '');
    const param = String(startParam ?? '');
    if (!NAME.test(name) || !offered.get(`${name.toLowerCase()}:${param}`)) {
      return { ok: false, error: 'unknown start', code: 'expired' };
    }
    return guarded(async (c) => {
      const user = await botOf(c, name);
      if (!user) {
        return { ok: false, error: 'not an inline bot', code: 'not-inline' };
      }
      const result = await run(`inline:start:${user.id}`, () =>
        c.client.invoke(
          new c.Api.messages.StartBot({
            bot: inputBot(c, user),
            peer: new c.Api.InputPeerUser({
              userId: user.id,
              accessHash: user.accessHash,
            }),
            randomId: randomIdOf(null, 0, c.helpers),
            startParam: param,
          })
        )
      );
      if (result && typeof result === 'object') {
        await apply(c.client, result);
      }
      return { ok: true, chat: text(user.id) };
    });
  };

export const createInlineBots = (env, { userClient, apply, lists, now }) => {
  const failure = failureOf(CODES);
  const bots = createKeeper(); // lowercase name -> { at, user | null }
  const answers = createKeeper(); // request -> { at, ttl, answer }
  const sendable = createKeeper(); // queryId -> { at, chat, ids }
  const offered = createKeeper(); // bot:param -> true (a "switch to PM")
  const run = (key, use) => runIn(env, key, use);

  const guarded = async (use) => {
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    try {
      return await use(c);
    } catch (error) {
      return failure(error);
    }
  };

  const botOf = async (c, username) => {
    const key = username.toLowerCase();
    const hit = bots.get(key);
    if (hit && now() - hit.at < BOT_MS) {
      return hit.user;
    }
    const found = await run(`inline:bot:${key}`, () =>
      resolveBotUser(c, username)
    );
    const user = typeof found?.botInlinePlaceholder === 'string' ? found : null;
    bots.set(key, { at: now(), user });
    return user;
  };

  const inlineBot = ({ username } = {}) => {
    const name = String(username ?? '');
    if (!NAME.test(name)) {
      return { ok: false, error: 'bad name', code: 'no-bot' };
    }
    return guarded(async (c) => {
      const user = await botOf(c, name);
      return user
        ? { ok: true, bot: botInfo(user, name) }
        : { ok: false, error: 'not an inline bot', code: 'not-inline' };
    });
  };

  const ask = async (c, user, { chat, query, offset }) =>
    run(`inline:query:${user.id}:${chat}`, () =>
      env.connection.withPeer(c.client, chat, (peer) =>
        c.client.invoke(
          new c.Api.messages.GetInlineBotResults({
            bot: inputBot(c, user),
            peer,
            query,
            offset,
          })
        )
      )
    );

  const shape = (answer, user, name, request) =>
    shapeAnswer({ answer, user, name, request, lists, now, sendable, offered });

  const inlineResults = async (body = {}) => {
    const chat = String(body.chat ?? '');
    const name = String(body.username ?? '');
    const query = String(body.query ?? '');
    const offset = String(body.offset ?? '');
    if (
      !CHAT.test(chat) ||
      !NAME.test(name) ||
      query.length > MAX_QUERY ||
      offset.length > MAX_OFFSET
    ) {
      return { ok: false, error: 'bad request', code: 'bad-request' };
    }
    const request = [chat, name.toLowerCase(), query, offset];
    const key = JSON.stringify(request);
    const hit = answers.get(key);
    if (!body.fresh && hit && now() - hit.at < hit.ttl * 1000) {
      return hit.answer;
    }
    return guarded(async (c) => {
      const user = await botOf(c, name);
      if (!user) {
        return { ok: false, error: 'not an inline bot', code: 'not-inline' };
      }
      const got = await ask(c, user, { chat, query, offset });
      const answer = shape(got, user, name, request);
      const ttl = Math.min(
        Math.max(Number(got.cacheTime) || 0, 0),
        MAX_CACHE_S
      );
      answers.set(key, { at: now(), ttl, answer });
      return answer;
    });
  };

  // A document's picture asks its list again: the query asked afresh.
  lists.onAgain('inline:', (rest) => {
    const [chat, username, query, offset] = JSON.parse(rest);
    return inlineResults({ chat, username, query, offset, fresh: true });
  });

  const inlineSend = async (draft = {}) => {
    const chat = String(draft.chat ?? '');
    const queryId = String(draft.queryId ?? '');
    const id = String(draft.id ?? '');
    const kept = QUERY_ID.test(queryId) ? sendable.get(queryId) : null;
    if (
      !kept ||
      kept.chat !== chat ||
      !kept.ids.has(id) ||
      now() - kept.at > SENDABLE_MS
    ) {
      return { ok: false, error: 'unknown answer', code: 'expired' };
    }
    return guarded(async (c) => {
      const client = await withSendAs(
        env,
        c.client,
        draft.sendAs,
        draft.allowPaidStars
      );
      const result = await env.connection.withPeer(client, chat, (peer) =>
        client.invoke(
          new c.Api.messages.SendInlineBotResult({
            peer,
            randomId: randomIdOf(draft.clientId, 0, c.helpers),
            queryId: c.helpers.returnBigInt(queryId),
            id,
            clearDraft: false,
            ...(draft.silent ? { silent: true } : {}),
            ...replyHeader(c.Api, draft.replyTo, null),
          })
        )
      );
      if (result && typeof result === 'object') {
        await apply(c.client, result);
      }
      return { ok: true, chat };
    });
  };

  const inlineStartBot = createStartBot({
    guarded,
    botOf,
    offered,
    run,
    apply,
  });

  return { inlineBot, inlineResults, inlineSend, inlineStartBot };
};
