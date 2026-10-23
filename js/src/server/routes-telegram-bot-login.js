// A bot's login links and the attachment menu (R-Y201): the routes of the
// POSTS table in routes-telegram.js, each validated strictly before the
// account is asked.
//
// Its routes:
//   POST /api/telegram/bot-url-auth {chat, id, buttonId, original?} or {url}
//                       -> { ok, status: default|accepted, url } or
//                       { ok, status: 'request', domain, bot,
//                       requestWriteAccess }: asks Telegram what pressing a
//                       login button (or opening a login-domain link) does
//   POST /api/telegram/bot-url-accept {chat, id, buttonId, original?} or
//                       {url}, writeAllowed (boolean) -> { ok, url } the
//                       login accepted; only after the person said yes
//   POST /api/telegram/url-auth-domains {} -> { ok, domains } the hosts
//                       whose links ask for a login
//   POST /api/telegram/attach-menu-bots {} -> { ok, bots } the bots of the
//                       attachment menu (id, name, shortName, peerTypes)
//   POST /api/telegram/attach-menu-bot {bot} or {username} -> { ok, bot }
//                       one bot's attachment-menu entry (inactive when it
//                       is not installed)
//   POST /api/telegram/attach-menu-toggle {bot, enabled, writeAllowed?}
//                       -> { ok } adds a bot to the menu or removes it

import { MAX_URL, webUrl } from '../sources/telegram-bot-login.js';

const ID = /^\d{1,20}$/;
const CHAT = /^-?\d{1,20}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

const bad = (error) => [400, { error, code: 'bad-request' }];
const optional = (value, ok) => value === undefined || ok(value);

// A login button's message and button, or a plain link's address.
const targetOk = (body) =>
  body.url !== undefined
    ? typeof body.url === 'string' &&
      body.url.length <= MAX_URL &&
      webUrl(body.url) !== null
    : CHAT.test(String(body.chat ?? '')) &&
      /^\d{1,10}$/.test(String(body.id ?? '')) &&
      /^-?\d{1,10}$/.test(String(body.buttonId ?? '')) &&
      optional(body.original, (u) => typeof u === 'string' && webUrl(u));

const pick = (body) =>
  Object.fromEntries(
    ['chat', 'id', 'buttonId', 'url', 'original']
      .filter((k) => body[k] !== undefined)
      .map((k) => [k, body[k]])
  );

// Asks the account's action `name` when it exists, else a 400.
const ask = async (account, name, args) =>
  typeof account[name] === 'function'
    ? [200, await account[name](args)]
    : bad('not available');

const botArgs = (body) =>
  body.username === undefined
    ? { bot: String(body.bot) }
    : { username: body.username };

export const BOT_LOGIN_POSTS = {
  'bot-url-auth': (account, body) =>
    targetOk(body)
      ? ask(account, 'botUrlAuth', pick(body))
      : bad('a login button or a web address required'),
  'bot-url-accept': (account, body) =>
    targetOk(body) && typeof body.writeAllowed === 'boolean'
      ? ask(account, 'botUrlAccept', {
          ...pick(body),
          writeAllowed: body.writeAllowed,
        })
      : bad('a login target and writeAllowed required'),
  'url-auth-domains': (account) => ask(account, 'urlAuthDomains'),
  'attach-menu-bots': (account) => ask(account, 'attachMenuBots'),
  'attach-menu-bot': (account, body) =>
    ID.test(String(body.bot ?? '')) !== NAME.test(String(body.username ?? ''))
      ? ask(account, 'attachMenuBot', botArgs(body))
      : bad('a bot id or username required'),
  'attach-menu-toggle': (account, body) =>
    ID.test(String(body.bot ?? '')) &&
    typeof body.enabled === 'boolean' &&
    optional(body.writeAllowed, (w) => typeof w === 'boolean')
      ? ask(account, 'attachMenuToggle', {
          bot: String(body.bot),
          enabled: body.enabled,
          ...(body.writeAllowed === undefined
            ? {}
            : { writeAllowed: body.writeAllowed }),
        })
      : bad('bot and enabled required'),
};
