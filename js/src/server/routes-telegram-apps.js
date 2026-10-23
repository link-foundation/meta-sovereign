// The bot and mini-app extras (R-Y194): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
// All reads; a prepared message is sent by the existing inline-send route.
//
// Its routes:
//   POST /api/telegram/apps-popular {offset?, limit?} -> { ok, apps: [{
//                       chat, name, username, users, mainApp }], next } the
//                       popular mini apps, a page at a time (limit 1..50)
//   POST /api/telegram/bot-similar {chat} -> { ok, bots: [...] } the bots
//                       Telegram recommends beside a bot
//   POST /api/telegram/prepared-message {bot, id} -> { ok, queryId, id,
//                       preview: { type, title, description }, peerTypes,
//                       bot } a message a mini app prepared; it is sent with
//                       inline-send to one chat, on a click
//   POST /api/telegram/collectible-info {kind, value} -> { ok, date, price:
//                       { amount, currency }, crypto: { amount, currency },
//                       url } kind is username | phone

import {
  ID,
  KINDS,
  MAX_PAGE,
  PREPARED_ID,
  collectibleOk,
} from '../sources/telegram-apps.js';

const bad = (error) => [400, { error, code: 'bad-request' }];
const OFFSET = /^[\x21-\x7e]{0,256}$/;

const popularOk = (body) =>
  (body.offset === undefined ||
    (typeof body.offset === 'string' && OFFSET.test(body.offset))) &&
  (body.limit === undefined ||
    (Number.isInteger(body.limit) &&
      body.limit >= 1 &&
      body.limit <= MAX_PAGE));

export const APPS_POSTS = {
  'apps-popular': async (account, body) =>
    popularOk(body) && typeof account.appsPopular === 'function'
      ? [
          200,
          await account.appsPopular({
            ...(body.offset ? { offset: body.offset } : {}),
            ...(body.limit ? { limit: body.limit } : {}),
          }),
        ]
      : bad('a valid page required'),
  'bot-similar': async (account, body) =>
    ID.test(String(body.chat ?? '')) && typeof account.botSimilar === 'function'
      ? [200, await account.botSimilar({ chat: String(body.chat) })]
      : bad('chat required'),
  'prepared-message': async (account, body) =>
    ID.test(String(body.bot ?? '')) &&
    typeof body.id === 'string' &&
    PREPARED_ID.test(body.id) &&
    typeof account.preparedMessage === 'function'
      ? [
          200,
          await account.preparedMessage({ bot: String(body.bot), id: body.id }),
        ]
      : bad('bot and message id required'),
  'collectible-info': async (account, body) =>
    KINDS.includes(body.kind) &&
    collectibleOk(body.kind, body.value) &&
    typeof account.collectibleInfo === 'function'
      ? [
          200,
          await account.collectibleInfo({ kind: body.kind, value: body.value }),
        ]
      : bad('kind and value required'),
};
