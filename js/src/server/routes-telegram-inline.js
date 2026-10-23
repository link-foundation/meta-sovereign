// Inline bots in the message box (R-Y138): the routes of the POSTS table
// in routes-telegram.js, each validated strictly before the account is
// asked.

import {
  MAX_OFFSET,
  MAX_QUERY,
  MAX_RESULT_ID,
  NAME,
} from '../sources/telegram-inline-bots.js';
import { validSendAs } from '../sources/telegram-send-as-client.js';

const START_PARAM = /^[A-Za-z0-9_-]{0,64}$/;
const NUMBER = /^-?\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];

const validChat = (chat) => typeof chat === 'string' && NUMBER.test(chat);
const validName = (name) => typeof name === 'string' && NAME.test(name);
// Words and an offset: text, no control characters, within the limits.
const plain = (value, max) =>
  typeof value === 'string' &&
  value.length <= max &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u001f\u007f]/.test(value);

const validSend = (body, replyTo) =>
  validChat(body.chat) &&
  validSendAs(body.sendAs) &&
  typeof body.queryId === 'string' &&
  NUMBER.test(body.queryId) &&
  typeof body.id === 'string' &&
  body.id.length > 0 &&
  plain(body.id, MAX_RESULT_ID) &&
  (replyTo === null || (Number.isInteger(replyTo) && replyTo > 0));

export const INLINE_POSTS = {
  'inline-bot': async (account, body) =>
    validName(body.username) && typeof account.inlineBot === 'function'
      ? [200, await account.inlineBot({ username: body.username })]
      : bad('username required'),
  'inline-results': async (account, body) =>
    validChat(body.chat) &&
    validName(body.username) &&
    plain(body.query ?? '', MAX_QUERY) &&
    plain(body.offset ?? '', MAX_OFFSET) &&
    typeof account.inlineResults === 'function'
      ? [
          200,
          await account.inlineResults({
            chat: body.chat,
            username: body.username,
            query: body.query ?? '',
            offset: body.offset ?? '',
          }),
        ]
      : bad('chat, username and query required'),
  'inline-send': async (account, body) => {
    const replyTo = body.replyTo === undefined ? null : Number(body.replyTo);
    if (!validSend(body, replyTo) || typeof account.inlineSend !== 'function') {
      return bad('chat, queryId and id required');
    }
    return [
      200,
      await account.inlineSend({
        chat: body.chat,
        queryId: body.queryId,
        id: body.id,
        replyTo,
        clientId: typeof body.clientId === 'string' ? body.clientId : null,
        ...(body.sendAs ? { sendAs: body.sendAs } : {}),
      }),
    ];
  },
  // "Switch to PM": /start with the bot's own start parameter (R-Y147).
  'inline-start-bot': async (account, body) =>
    validName(body.username) &&
    typeof body.startParam === 'string' &&
    START_PARAM.test(body.startParam) &&
    typeof account.inlineStartBot === 'function'
      ? [
          200,
          await account.inlineStartBot({
            username: body.username,
            startParam: body.startParam,
          }),
        ]
      : bad('username and startParam required'),
};
