// A bot's mini apps (R-Y168): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/web-app-open {kind, chat?, bot?, url?, username?,
//                       shortName?, startParam?, theme?}
//                       -> { ok, url, queryId, fullsize, bot? } where kind is
//                       menu | inline | simple | app | main; an address must
//                       be https; theme is `key: #rrggbb` pairs (R-Y168)
//   POST /api/telegram/web-app-prolong {chat, bot, queryId} -> { ok } keeps
//                       an open app's query alive (silent)
//   POST /api/telegram/web-app-data {bot, text, data} -> { ok } a reply
//                       keyboard app's data (at most 4096 bytes) sent

import {
  KINDS,
  MAX_DATA,
  MAX_TEXT,
  httpsUrl,
  startParamOk,
  themeOf,
} from '../sources/telegram-web-apps.js';

const ID = /^\d{1,20}$/;
const CHAT = /^-?\d{1,20}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const SHORT = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;

const bad = (error) => [400, { error, code: 'bad-request' }];
const optional = (value, ok) => value === undefined || ok(value);

// The fields every kind may carry.
const generalOk = (body) =>
  KINDS.includes(body.kind) &&
  startParamOk(body.startParam) &&
  optional(body.theme, (t) => themeOf(t) !== null) &&
  optional(body.url, (u) => typeof u === 'string' && httpsUrl(u) !== null) &&
  optional(body.chat, (c) => CHAT.test(String(c)));

const linkOk = (body) =>
  NAME.test(String(body.username ?? '')) &&
  (body.kind === 'main' || SHORT.test(String(body.shortName ?? '')));

const buttonOk = (body) =>
  ID.test(String(body.bot ?? '')) &&
  (body.kind === 'simple' || body.chat !== undefined) &&
  (['menu', 'attach'].includes(body.kind) || body.url !== undefined);

const openOk = (body) =>
  generalOk(body) &&
  (body.kind === 'app' || body.kind === 'main' ? linkOk(body) : buttonOk(body));

const pick = (body, keys) =>
  Object.fromEntries(
    keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])
  );

export const WEB_APPS_POSTS = {
  'web-app-open': async (account, body) =>
    openOk(body) && typeof account.webAppOpen === 'function'
      ? [
          200,
          await account.webAppOpen(
            pick(body, [
              'kind',
              'chat',
              'bot',
              'url',
              'username',
              'shortName',
              'startParam',
              'theme',
            ])
          ),
        ]
      : bad('a valid app request required'),
  'web-app-prolong': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    ID.test(String(body.bot ?? '')) &&
    ID.test(String(body.queryId ?? '')) &&
    typeof account.webAppProlong === 'function'
      ? [
          200,
          await account.webAppProlong({
            chat: String(body.chat),
            bot: String(body.bot),
            queryId: String(body.queryId),
          }),
        ]
      : bad('chat, bot and queryId required'),
  'web-app-data': async (account, body) =>
    ID.test(String(body.bot ?? '')) &&
    typeof body.text === 'string' &&
    body.text.trim().length > 0 &&
    body.text.length <= MAX_TEXT &&
    typeof body.data === 'string' &&
    body.data.length > 0 &&
    Buffer.byteLength(body.data) <= MAX_DATA &&
    typeof account.webAppSendData === 'function'
      ? [
          200,
          await account.webAppSendData({
            bot: String(body.bot),
            text: body.text,
            data: body.data,
          }),
        ]
      : bad('bot, button text and data (up to 4096 bytes) required'),
};
