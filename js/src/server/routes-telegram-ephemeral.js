// Ephemeral messages (layer 232; R-Y223; learned, never copied): a bot's
// messages shown to this user only. The routes of the POSTS and GETS
// tables in routes-telegram.js, each validated strictly before the
// account is asked.
//
// Its routes:
//   GET  /api/telegram/ephemeral?chat= -> { ok, messages } the chat's
//                       ephemeral messages the app kept (`eph:` links,
//                       deleted ones left out); live changes come over
//                       /api/events like any message. Only the app.
//   POST /api/telegram/ephemeral-callback {chat, id, data} -> { ok,
//                       message, alert, url } a press on an inline
//                       callback button (data in base64) of ephemeral
//                       message `id` (ephemeral.getCallbackAnswer)

import { json } from './util.js';
import { fromApp } from './routes-telegram-files.js';
import { invalid, route } from './routes-telegram-admin-extras.js';

const CHAT = /^-?\d{1,20}$/;
const DATA = /^[A-Za-z0-9+/]{1,88}={0,2}$/;

const handleEphemeral = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return json(res, 403, { error: 'messages load only in the app' }) ?? true;
  }
  const chat = new URL(req.url, 'http://local').searchParams.get('chat') ?? '';
  if (!CHAT.test(chat) || typeof account.ephemeralMessages !== 'function') {
    const [status, body] = invalid('chat required');
    return json(res, status, body) ?? true;
  }
  return json(res, 200, await account.ephemeralMessages({ chat })) ?? true;
};

export const EPHEMERAL_GETS = { ephemeral: handleEphemeral };

export const EPHEMERAL_POSTS = {
  'ephemeral-callback': route(
    'ephemeralCallback',
    'chat, id and data required',
    (b) =>
      CHAT.test(String(b.chat ?? '')) &&
      Number.isInteger(b.id) &&
      b.id > 0 &&
      DATA.test(String(b.data ?? '')),
    (b) => ({ chat: String(b.chat), id: b.id, data: String(b.data) })
  ),
};
