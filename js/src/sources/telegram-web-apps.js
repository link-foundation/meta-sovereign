/**
 * A bot's mini apps (Web Apps), as Telegram Desktop opens them (R-Y168;
 * learned from Telegram's public Mini Apps documentation, never copied):
 * - `webAppOpen({ kind, ... })` asks Telegram for the address the app is
 *   shown from → `{ ok, url, queryId, fullsize, bot? }`:
 *     'menu'    the bot's menu button (messages.requestWebView, from the
 *               bot menu): `chat`, `bot`, `url?`;
 *     'inline'  an inline keyboard button (messages.requestWebView):
 *               `chat`, `bot`, `url`;
 *     'simple'  a reply keyboard button (messages.requestSimpleWebView):
 *               `bot`, `url`;
 *     'app'     a t.me/bot/app link (messages.getBotApp, then
 *               messages.requestAppWebView): `username`, `shortName`,
 *               `startParam?`, `chat?`;
 *     'main'    a t.me/bot?startapp link (messages.requestMainWebView):
 *               `username`, `startParam?`, `chat?`.
 *   `theme` is the app's colours (theme_params); the platform is 'weba',
 *   the name Telegram's own web client gives, as this is a web client.
 * - `webAppProlong({ chat, bot, queryId })` keeps a query alive while the
 *   app is open (messages.prolongWebView, silent) — the page asks every 60
 *   seconds;
 * - `webAppSendData({ bot, text, data })` is a reply-keyboard app's
 *   `web_app_data_send` (messages.sendWebViewData).
 * The address Telegram answers must be https without credentials, else
 * nothing is opened. 'attach' (R-Y201): an attachment-menu bot's app, from
 * the chat, with no address (messages.requestWebView, not from the bot menu).
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';
import { inputUserOf } from './telegram-peer-actions.js';
import { inputBot, resolveBotUser } from './telegram-inline-bots.js';
import { randomIdOf } from './telegram-send.js';

const CODES = {
  BOT_INVALID: 'no-bot',
  BOT_APP_INVALID: 'no-app',
  BOT_APP_SHORTNAME_INVALID: 'no-app',
  USERNAME_NOT_OCCUPIED: 'no-bot',
  USERNAME_INVALID: 'no-bot',
  URL_INVALID: 'bad-url',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  BOT_DOMAIN_INVALID: 'bad-url',
  DATA_INVALID: 'bad-data',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

export const PLATFORM = 'weba';
// 'attach': an attachment-menu bot's app (R-Y201), no address asked.
export const KINDS = ['menu', 'inline', 'simple', 'app', 'main', 'attach'];
export const MAX_URL = 2048;
export const MAX_DATA = 4096;
export const MAX_TEXT = 64;

const ID = /^\d{1,20}$/;
const CHAT = /^-?\d{1,20}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const SHORT = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;
const START = /^[A-Za-z0-9_-]{0,512}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const BAD = { ok: false, error: 'bad request', code: 'bad-request' };

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

/** An https address without credentials, within bounds; else null. */
export const httpsUrl = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > MAX_URL) {
    return null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

/** The theme as sent: `key: #rrggbb` pairs only, or null. */
export const themeOf = (theme) => {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    return null;
  }
  const entries = Object.entries(theme);
  return entries.length <= 32 &&
    entries.every(([k, v]) => /^[a-z_]{1,40}$/.test(k) && COLOR.test(String(v)))
    ? Object.fromEntries(entries)
    : null;
};

/** Whether `value` may be a start parameter (absent is fine). */
export const startParamOk = (value) =>
  value === undefined || (typeof value === 'string' && START.test(value));

const botOut = (user) => ({
  id: text(user?.id),
  name:
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    String(user?.username ?? ''),
  username: String(user?.username ?? ''),
});

// Theme and platform ride along on every request.
const common = (c, theme) => {
  const ok = themeOf(theme);
  return {
    ...(ok
      ? { themeParams: new c.Api.DataJSON({ data: JSON.stringify(ok) }) }
      : {}),
    platform: PLATFORM,
  };
};

const resultOf = (answer, bot) => {
  const url = httpsUrl(answer?.url);
  if (!url) {
    return { ok: false, error: 'bad address', code: 'bad-url' };
  }
  return {
    ok: true,
    url,
    queryId:
      answer.queryId === undefined || answer.queryId === null
        ? null
        : text(answer.queryId),
    fullsize: Boolean(answer.fullsize),
    ...(bot ? { bot } : {}),
  };
};

// A user as the input a request names, from the chat id alone.
const userIn = (c, env, id) =>
  env.connection.withPeer(c.client, String(id), (peer) => inputUserOf(c, peer));

const peerIn = (c, env, chat) =>
  env.connection.withPeer(c.client, String(chat), (peer) => peer);

const MENUS = ['menu', 'attach'];
const NO_BOT = { ok: false, error: 'not a bot', code: 'no-bot' };

const openMenu = async (c, env, o) => {
  const [peer, bot] = await Promise.all([
    peerIn(c, env, o.chat),
    userIn(c, env, o.bot),
  ]);
  const answer = await runIn(env, `web-app:${o.bot}`, () =>
    c.client.invoke(
      new c.Api.messages.RequestWebView({
        peer,
        bot,
        ...(o.kind === 'menu' ? { fromBotMenu: true } : {}),
        ...(o.url ? { url: o.url } : {}),
        ...(o.startParam ? { startParam: o.startParam } : {}),
        ...common(c, o.theme),
      })
    )
  );
  return resultOf(answer);
};

const openSimple = async (c, env, o) => {
  const bot = await userIn(c, env, o.bot);
  const answer = await runIn(env, `web-app:${o.bot}`, () =>
    c.client.invoke(
      new c.Api.messages.RequestSimpleWebView({
        bot,
        url: o.url,
        ...common(c, o.theme),
      })
    )
  );
  return resultOf(answer);
};

const openApp = async (c, env, o) => {
  const user = await runIn(env, `web-app:resolve:${o.username}`, () =>
    resolveBotUser(c, o.username)
  );
  if (!user) {
    return NO_BOT;
  }
  const found = await runIn(env, `web-app:app:${o.username}`, () =>
    c.client.invoke(
      new c.Api.messages.GetBotApp({
        app: new c.Api.InputBotAppShortName({
          botId: inputBot(c, user),
          shortName: o.shortName,
        }),
        hash: c.zero,
      })
    )
  );
  const app = found?.app;
  if (app?.className !== 'BotApp') {
    return { ok: false, error: 'no such app', code: 'no-app' };
  }
  const peer = await peerIn(c, env, o.chat ?? text(user.id));
  const answer = await runIn(env, `web-app:app:${o.username}`, () =>
    c.client.invoke(
      new c.Api.messages.RequestAppWebView({
        peer,
        app: new c.Api.InputBotAppID({
          id: app.id,
          accessHash: app.accessHash,
        }),
        ...(o.startParam ? { startParam: o.startParam } : {}),
        ...common(c, o.theme),
      })
    )
  );
  return resultOf(answer, { ...botOut(user), title: String(app.title ?? '') });
};

const openMain = async (c, env, o) => {
  const user = await runIn(env, `web-app:resolve:${o.username}`, () =>
    resolveBotUser(c, o.username)
  );
  if (!user) {
    return NO_BOT;
  }
  const peer = await peerIn(c, env, o.chat ?? text(user.id));
  const answer = await runIn(env, `web-app:main:${o.username}`, () =>
    c.client.invoke(
      new c.Api.messages.RequestMainWebView({
        peer,
        bot: inputBot(c, user),
        ...(o.startParam ? { startParam: o.startParam } : {}),
        ...common(c, o.theme),
      })
    )
  );
  return resultOf(answer, botOut(user));
};

const OPENERS = {
  menu: openMenu,
  inline: openMenu,
  attach: openMenu,
  simple: openSimple,
  app: openApp,
  main: openMain,
};

// A link's app: the bot's username, the app's short name (not for the
// main app) and, when given, the chat it opens from.
const linkReady = (o) =>
  NAME.test(o.username ?? '') &&
  (o.kind === 'main' || SHORT.test(o.shortName ?? '')) &&
  (o.chat === undefined || CHAT.test(String(o.chat)));

// A button's app: the bot, the chat (not for a simple one) and the
// https address (the menu button may leave it to Telegram).
const buttonReady = (o) =>
  ID.test(String(o.bot ?? '')) &&
  (o.kind === 'simple' || CHAT.test(String(o.chat ?? ''))) &&
  (o.url ? true : MENUS.includes(o.kind) && o.url === undefined);

// What each kind must carry, checked before the account is asked.
const complete = (o) =>
  KINDS.includes(o.kind) &&
  startParamOk(o.startParam) &&
  (o.kind === 'app' || o.kind === 'main' ? linkReady(o) : buttonReady(o));

export const createWebApps = (env, { userClient, apply }) => ({
  webAppOpen: async (options = {}) => {
    // An address that is not https is nulled, which fails `complete`.
    const o = {
      ...options,
      ...(options.url === undefined ? {} : { url: httpsUrl(options.url) }),
    };
    if (!complete(o)) {
      return BAD;
    }
    return connected(env, userClient, failure, (c) =>
      OPENERS[o.kind](c, env, o)
    );
  },
  webAppProlong: async ({ chat, bot, queryId } = {}) => {
    if (
      !CHAT.test(String(chat)) ||
      !ID.test(String(bot)) ||
      !ID.test(String(queryId))
    ) {
      return BAD;
    }
    return connected(env, userClient, failure, async (c) => {
      const [peer, user] = await Promise.all([
        peerIn(c, env, chat),
        userIn(c, env, bot),
      ]);
      await runIn(env, `web-app:prolong:${queryId}`, () =>
        c.client.invoke(
          new c.Api.messages.ProlongWebView({
            silent: true,
            peer,
            bot: user,
            queryId: c.helpers.returnBigInt(String(queryId)),
          })
        )
      );
      return { ok: true };
    });
  },
  webAppSendData: async ({ bot, text: label, data } = {}) => {
    const words = typeof label === 'string' ? label.trim() : '';
    const body = typeof data === 'string' ? data : '';
    if (
      !ID.test(String(bot)) ||
      !words ||
      words.length > MAX_TEXT ||
      !body ||
      Buffer.byteLength(body) > MAX_DATA
    ) {
      return BAD;
    }
    return connected(env, userClient, failure, async (c) => {
      const user = await userIn(c, env, bot);
      const result = await runIn(env, `web-app:data:${bot}`, () =>
        c.client.invoke(
          new c.Api.messages.SendWebViewData({
            bot: user,
            randomId: randomIdOf(null, 0, c.helpers),
            buttonText: words,
            data: body,
          })
        )
      );
      if (result && typeof result === 'object' && apply) {
        await apply(c.client, result);
      }
      return { ok: true };
    });
  },
});
