/**
 * The bot and mini-app extras of Telegram Desktop (R-Y194; learned,
 * never copied). All reads; the only send is the existing inline-result
 * send, asked for by the page on a click:
 * - `appsPopular({ offset?, limit? })` — the popular mini apps
 *   (bots.getPopularAppBots), a page at a time → `{ ok, apps: [{ chat,
 *   name, username, users, mainApp }], next }` (`users` the bot's monthly
 *   users when Telegram says, `next` the offset of the next page);
 * - `botSimilar({ chat })` — the bots Telegram recommends beside a bot
 *   (bots.getBotRecommendations; Telegram limits the list for accounts
 *   without Premium) → `{ ok, bots: [same shape] }`;
 * - `preparedMessage({ bot, id })` — the message a mini app prepared
 *   (messages.getPreparedInlineMessage) → `{ ok, queryId, id, preview:
 *   { type, title, description }, peerTypes, bot }`; it is then offered
 *   to the inline send, which sends it to one chat chosen by the click;
 * - `collectibleInfo({ kind, value })` — what Fragment knows of a
 *   collectible username or phone number (fragment.getCollectibleInfo) →
 *   `{ ok, date, price: { amount, currency }, crypto: { amount, currency },
 *   url }` (amounts in the currency's smallest units).
 * Answers are kept five minutes. Errors become codes.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';
import { inputUserOf } from './telegram-peer-actions.js';

const CODES = {
  BOT_INVALID: 'no-bot',
  USER_ID_INVALID: 'no-bot',
  PEER_ID_INVALID: 'no-bot',
  USERNAME_INVALID: 'not-collectible',
  PHONE_NUMBER_INVALID: 'not-collectible',
  MESSAGE_EXPIRED: 'expired',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'bad-request' };
const KEEP_MS = 5 * 60_000;

export const MAX_PAGE = 50;
export const DEFAULT_PAGE = 20;
export const ID = /^\d{1,20}$/;
export const PREPARED_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
export const PHONE = /^\+?\d{5,20}$/;
export const KINDS = ['username', 'phone'];

const textOf = (value) => String(value?.value ?? value);
const numberOf = (value) => Number(textOf(value ?? 0)) || 0;

/** A bot as the page lists it; null for anything but a user. */
export const botOf = (user) =>
  user?.className === 'User'
    ? {
        chat: textOf(user.id),
        name:
          [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          String(user.username ?? ''),
        username: user.username ?? null,
        users:
          user.botActiveUsers === undefined || user.botActiveUsers === null
            ? null
            : numberOf(user.botActiveUsers),
        mainApp: Boolean(user.botHasMainApp),
      }
    : null;

/** The kinds of chat a prepared message may go to, as words. */
export const PEER_TYPES = {
  InlineQueryPeerTypeSameBotPM: 'same-bot',
  InlineQueryPeerTypePM: 'users',
  InlineQueryPeerTypeBotPM: 'bots',
  InlineQueryPeerTypeChat: 'groups',
  InlineQueryPeerTypeMegagroup: 'groups',
  InlineQueryPeerTypeBroadcast: 'channels',
};

/** The words for Telegram's peer types, each once. */
export const peerTypesOf = (list) => [
  ...new Set(
    (Array.isArray(list) ? list : [])
      .map((type) => PEER_TYPES[type?.className])
      .filter(Boolean)
  ),
];

/** The prepared result as a preview (the page never loads its media). */
export const previewOf = (result) => ({
  type: String(result?.type ?? ''),
  title: String(result?.title ?? ''),
  description: String(result?.description ?? ''),
});

/** Whether a collectible request is well formed. */
export const collectibleOk = (kind, value) =>
  (kind === 'username' && USERNAME.test(String(value ?? ''))) ||
  (kind === 'phone' && PHONE.test(String(value ?? '')));

const keeper = () => {
  const map = new Map();
  return {
    get: (key, now) => {
      const hit = map.get(key);
      return hit && now - hit.at < KEEP_MS ? hit.value : undefined;
    },
    set: (key, value, now) => {
      map.set(key, { at: now, value });
      while (map.size > 60) {
        map.delete(map.keys().next().value);
      }
      return value;
    },
  };
};

export const createApps = (env, { userClient, tools, offer }) => {
  const now = () => (env.now ?? Date.now)();
  const memory = keeper();

  // A listed bot is remembered, so opening it reads it at once.
  const remember = async (users) => {
    for (const user of users) {
      const bot = botOf(user);
      if (!bot) {
        continue;
      }
      try {
        await env.peers?.remember(
          bot.chat,
          user,
          tools?.dialogOfEntity?.(bot.chat, user)
        );
      } catch {
        // the list is shown all the same
      }
    }
  };

  const inputOf = (c, chat) =>
    env.connection.withPeer(c.client, chat, (peer) => inputUserOf(c, peer));

  const appsPopular = async (body = {}) => {
    const offset = String(body.offset ?? '');
    const limit = Number(body.limit ?? DEFAULT_PAGE);
    if (
      offset.length > 256 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_PAGE
    ) {
      return BAD;
    }
    const key = `popular:${offset}:${limit}`;
    const have = memory.get(key, now());
    if (have) {
      return have;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `apps:popular:${offset}`, () =>
        c.client.invoke(new c.Api.bots.GetPopularAppBots({ offset, limit }))
      );
      const users = answer?.users ?? [];
      await remember(users);
      return memory.set(
        key,
        {
          ok: true,
          apps: users.map(botOf).filter(Boolean),
          next: answer?.nextOffset || null,
        },
        now()
      );
    });
  };

  const botSimilar = async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!ID.test(chat)) {
      return BAD;
    }
    const have = memory.get(`similar:${chat}`, now());
    if (have) {
      return have;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `apps:similar:${chat}`, async () =>
        c.client.invoke(
          new c.Api.bots.GetBotRecommendations({ bot: await inputOf(c, chat) })
        )
      );
      const users = answer?.users ?? [];
      await remember(users);
      return memory.set(
        `similar:${chat}`,
        { ok: true, bots: users.map(botOf).filter(Boolean) },
        now()
      );
    });
  };

  const preparedMessage = async (body = {}) => {
    const bot = String(body.bot ?? '');
    const id = String(body.id ?? '');
    if (!ID.test(bot) || !PREPARED_ID.test(id)) {
      return BAD;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `apps:prepared:${id}`, async () =>
        c.client.invoke(
          new c.Api.messages.GetPreparedInlineMessage({
            bot: await inputOf(c, bot),
            id,
          })
        )
      );
      const result = answer?.result;
      if (!result?.id || answer.queryId === undefined) {
        return { ok: false, error: 'no message', code: 'expired' };
      }
      const queryId = textOf(answer.queryId);
      offer?.({ queryId, id: String(result.id) });
      return {
        ok: true,
        queryId,
        id: String(result.id),
        preview: previewOf(result),
        peerTypes: peerTypesOf(answer.peerTypes),
        bot,
      };
    });
  };

  const collectibleInfo = async (body = {}) => {
    const { kind, value } = body;
    if (!collectibleOk(kind, value)) {
      return BAD;
    }
    const key = `collectible:${kind}:${value}`;
    const have = memory.get(key, now());
    if (have) {
      return have;
    }
    return connected(env, userClient, failure, async (c) => {
      const collectible =
        kind === 'username'
          ? new c.Api.InputCollectibleUsername({ username: value })
          : new c.Api.InputCollectiblePhone({ phone: value });
      const info = await runIn(env, `apps:${key}`, () =>
        c.client.invoke(new c.Api.fragment.GetCollectibleInfo({ collectible }))
      );
      return memory.set(
        key,
        {
          ok: true,
          date: numberOf(info?.purchaseDate),
          price: {
            amount: textOf(info?.amount ?? 0),
            currency: String(info?.currency ?? ''),
          },
          crypto: {
            amount: textOf(info?.cryptoAmount ?? 0),
            currency: String(info?.cryptoCurrency ?? ''),
          },
          url: String(info?.url ?? ''),
        },
        now()
      );
    });
  };

  return { appsPopular, botSimilar, preparedMessage, collectibleInfo };
};
