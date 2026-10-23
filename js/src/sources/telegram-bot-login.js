/**
 * A bot's login links and the attachment menu (R-Y201; learned from how
 * Telegram Desktop behaves, never copied):
 * - `botUrlAuth({ chat, id, buttonId })` or `botUrlAuth({ url })`
 *   (messages.requestUrlAuth: a login button under a message, or a plain
 *   link whose domain is a login domain) → `{ ok, status, url }` where
 *   status is 'default' or 'accepted' (open `url`; the link itself for
 *   'default'), or `{ ok, status: 'request', domain, bot,
 *   requestWriteAccess }` when the person must be asked first;
 * - `botUrlAccept({ chat, id, buttonId } | { url }, writeAllowed)`
 *   (messages.acceptUrlAuth) → `{ ok, url }`, called only after the
 *   person ticked "Log in" and pressed Open;
 * - `urlAuthDomains()` (help.getAppConfig, `url_auth_domains`) → `{ ok,
 *   domains }`: the hosts whose links ask for a login. (Not done: the
 *   `autologin_domains` token appending, which only adds a query token.)
 * - `attachMenuBots()` (messages.getAttachMenuBots), `attachMenuBot({ bot |
 *   username })` (messages.getAttachMenuBot) and `attachMenuToggle({ bot,
 *   enabled, writeAllowed })` (messages.toggleBotInAttachMenu).
 * Nothing here runs unless the page asks on a person's press.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';
import { inputUserOf } from './telegram-peer-actions.js';
import { inputBot, resolveBotUser } from './telegram-inline-bots.js';

const CODES = {
  BOT_INVALID: 'no-bot',
  USERNAME_NOT_OCCUPIED: 'no-bot',
  USERNAME_INVALID: 'no-bot',
  URL_EXPIRED: 'expired',
  MESSAGE_ID_INVALID: 'bad-request',
  BUTTON_ID_INVALID: 'bad-request',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

export const MAX_URL = 2048;
const ID = /^\d{1,20}$/;
const CHAT = /^-?\d{1,20}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const DOMAIN_KEY = 'url_auth_domains';
const BAD = { ok: false, error: 'bad request', code: 'bad-request' };
const NO_BOT = { ok: false, error: 'not a bot', code: 'no-bot' };

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

/** An http(s) address without credentials, within bounds; else null. */
export const webUrl = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > MAX_URL) {
    return null;
  }
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

const botOut = (user) => ({
  id: text(user?.id),
  name:
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    String(user?.username ?? ''),
  username: String(user?.username ?? ''),
});

/** What Telegram's urlAuthResult says, as the page's answer. */
export const authOut = (answer, original) => {
  const name = answer?.className;
  if (name === 'UrlAuthResultRequest') {
    return {
      ok: true,
      status: 'request',
      domain: String(answer.domain ?? ''),
      bot: botOut(answer.bot),
      requestWriteAccess: Boolean(answer.requestWriteAccess),
    };
  }
  const accepted = name === 'UrlAuthResultAccepted';
  const url = webUrl(accepted ? answer.url : original);
  return url
    ? { ok: true, status: accepted ? 'accepted' : 'default', url }
    : { ok: false, error: 'bad address', code: 'bad-url' };
};

/** The domains of an app config's `url_auth_domains` (lower case). */
export const domainsOf = (config) => {
  const entry = (config?.config?.value ?? config?.value ?? []).find(
    (e) => e?.key === DOMAIN_KEY
  );
  return (entry?.value?.value ?? [])
    .map((one) => String(one?.value ?? '').toLowerCase())
    .filter((d) => /^[a-z0-9.-]{1,253}$/.test(d));
};

// The peer types of an attachment-menu bot as words.
const TYPES = {
  AttachMenuPeerTypeSameBotPM: 'sameBotPm',
  AttachMenuPeerTypeBotPM: 'botPm',
  AttachMenuPeerTypePM: 'pm',
  AttachMenuPeerTypeChat: 'chat',
  AttachMenuPeerTypeBroadcast: 'broadcast',
};

/** One attachment-menu bot as the page lists it. */
export const attachBotOut = (bot) => ({
  id: text(bot.botId),
  shortName: String(bot.shortName ?? ''),
  peerTypes: (bot.peerTypes ?? [])
    .map((t) => TYPES[t?.className])
    .filter(Boolean),
  inactive: Boolean(bot.inactive),
  requestWriteAccess: Boolean(bot.requestWriteAccess),
});

// The form of a request naming a button or a plain link, else null.
const targetOf = (o) => {
  if (o.url !== undefined) {
    const url = webUrl(o.url);
    return url ? { url } : null;
  }
  return CHAT.test(String(o.chat ?? '')) &&
    /^\d{1,10}$/.test(String(o.id ?? '')) &&
    /^-?\d{1,10}$/.test(String(o.buttonId ?? ''))
    ? { chat: String(o.chat), id: Number(o.id), buttonId: Number(o.buttonId) }
    : null;
};

// The request fields of a target (the peer resolved for a button).
const fieldsOf = async (c, env, target) =>
  target.url
    ? { url: target.url }
    : {
        peer: await env.connection.withPeer(c.client, target.chat, (p) => p),
        msgId: target.id,
        buttonId: target.buttonId,
      };

const userNamed = (answer, id) =>
  (answer?.users ?? []).find((u) => text(u.id) === text(id));

const botFound = async (c, env, o) => {
  if (o.username) {
    const user = await resolveBotUser(c, o.username);
    return user ? inputBot(c, user) : null;
  }
  return env.connection.withPeer(c.client, String(o.bot), (peer) =>
    inputUserOf(c, peer)
  );
};

const nameFor = (answer, bot) =>
  botOut(userNamed(answer, bot.botId)).name || String(bot.shortName ?? '');

export const createBotLogin = (env, { userClient }) => ({
  botUrlAuth: async (options = {}) => {
    const target = targetOf(options);
    if (!target) {
      return BAD;
    }
    return connected(env, userClient, failure, (c) =>
      runIn(env, 'bot-login', async () => {
        const answer = await c.client.invoke(
          new c.Api.messages.RequestUrlAuth(await fieldsOf(c, env, target))
        );
        return authOut(answer, target.url ?? webUrl(options.original));
      })
    );
  },
  botUrlAccept: async (options = {}) => {
    const target = targetOf(options);
    if (!target || typeof options.writeAllowed !== 'boolean') {
      return BAD;
    }
    return connected(env, userClient, failure, (c) =>
      runIn(env, 'bot-login', async () => {
        const answer = await c.client.invoke(
          new c.Api.messages.AcceptUrlAuth({
            ...(options.writeAllowed ? { writeAllowed: true } : {}),
            ...(await fieldsOf(c, env, target)),
          })
        );
        const out = authOut(answer, target.url ?? webUrl(options.original));
        return out.ok && out.status !== 'request'
          ? out
          : { ...BAD, code: 'bad-url' };
      })
    );
  },
  urlAuthDomains: async () =>
    connected(env, userClient, failure, async (c) => {
      const config = await runIn(env, 'app-config', () =>
        c.client.invoke(new c.Api.help.GetAppConfig({ hash: 0 }))
      );
      return { ok: true, domains: domainsOf(config) };
    }),
  attachMenuBots: async () =>
    connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, 'attach-menu', () =>
        c.client.invoke(new c.Api.messages.GetAttachMenuBots({ hash: c.zero }))
      );
      return {
        ok: true,
        bots: (answer?.bots ?? []).map((bot) => ({
          ...attachBotOut(bot),
          name: nameFor(answer, bot),
        })),
      };
    }),
  attachMenuBot: async ({ bot, username } = {}) => {
    if (username ? !NAME.test(String(username)) : !ID.test(String(bot ?? ''))) {
      return BAD;
    }
    return connected(env, userClient, failure, async (c) => {
      const user = await botFound(c, env, { bot, username });
      if (!user) {
        return NO_BOT;
      }
      const answer = await runIn(env, 'attach-menu', () =>
        c.client.invoke(new c.Api.messages.GetAttachMenuBot({ bot: user }))
      );
      const found = answer?.bot;
      if (!found) {
        return NO_BOT;
      }
      return {
        ok: true,
        bot: {
          ...attachBotOut(found),
          name: nameFor(answer, found),
          username: String(userNamed(answer, found.botId)?.username ?? ''),
        },
      };
    });
  },
  attachMenuToggle: async ({ bot, enabled, writeAllowed } = {}) => {
    if (
      !ID.test(String(bot ?? '')) ||
      typeof enabled !== 'boolean' ||
      (writeAllowed !== undefined && typeof writeAllowed !== 'boolean')
    ) {
      return BAD;
    }
    return connected(env, userClient, failure, async (c) => {
      const user = await botFound(c, env, { bot });
      await runIn(env, 'attach-menu', () =>
        c.client.invoke(
          new c.Api.messages.ToggleBotInAttachMenu({
            ...(enabled && writeAllowed ? { writeAllowed: true } : {}),
            bot: user,
            enabled,
          })
        )
      );
      return { ok: true };
    });
  },
});
