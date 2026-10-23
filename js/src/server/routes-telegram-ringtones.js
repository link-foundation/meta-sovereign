// Notification sounds (R-Y181): the routes of the POSTS and GETS tables in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/ringtones -> { ok, ringtones: [{ id, title,
//                       duration, size }], limits: { sizeBytes, seconds,
//                       count } } the saved ringtones (account.getSaved-
//                       Ringtones)
//   POST /api/telegram/ringtone-add {token} -> { ok, ringtone } an upload
//                       (POST /upload) saved as a new ringtone; the only
//                       write besides the two below, on an explicit Save
//   POST /api/telegram/ringtone-remove {id} -> { ok } a saved ringtone
//                       removed (account.saveRingtone with unsave)
//   GET  /api/telegram/ringtone?id= -> the ringtone's audio, for the page
//                       to play when a notification shows (only the app)
//   A chat's own sound is set with notify-chat-set {sound}.

import { json } from './util.js';
import { fromApp } from './routes-telegram-files.js';
import { ID } from '../sources/telegram-ringtones.js';

const bad = (error) => [400, { error, code: 'bad-request' }];

// GET /api/telegram/ringtone?id= -> the audio's bytes, only for the app's
// own pages.
const handleRingtone = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return json(res, 403, { error: 'ringtones load only in the app' }) ?? true;
  }
  if (typeof account.ringtoneFile !== 'function') {
    return json(res, 501, { error: 'ringtones not available' }) ?? true;
  }
  const id = new URL(req.url, 'http://local').searchParams.get('id') ?? '';
  if (!ID.test(id)) {
    return json(res, 400, { error: 'bad ringtone' }) ?? true;
  }
  const result = await account.ringtoneFile({ id });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no ringtone' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType,
    'content-length': result.buffer.length,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

export const RINGTONE_GETS = { ringtone: handleRingtone };

export const RINGTONE_POSTS = {
  ringtones: async (account) =>
    typeof account.ringtoneList === 'function'
      ? [200, await account.ringtoneList()]
      : bad('not supported'),
  'ringtone-add': async (account, body) =>
    /^[A-Za-z0-9_-]{1,80}$/.test(String(body.token ?? '')) &&
    typeof account.ringtoneAdd === 'function'
      ? [200, await account.ringtoneAdd({ token: String(body.token) })]
      : bad('an upload required'),
  'ringtone-remove': async (account, body) =>
    ID.test(String(body.id ?? '')) &&
    typeof account.ringtoneRemove === 'function'
      ? [200, await account.ringtoneRemove({ id: String(body.id) })]
      : bad('ringtone required'),
};
