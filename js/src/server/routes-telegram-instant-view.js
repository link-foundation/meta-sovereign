// Instant View (R-Y205): the routes of the POSTS and GETS tables in
// routes-telegram.js, validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/instant-view {url, hash?} -> { ok, available,
//        siteName?, title?, page? } the cached page of a link as a safe
//        tree (R-Y205); a t.me/iv?url=… link names the page it wraps;
//        errors come as codes (not-found, unreachable, bad-url, flood)
//   GET  /api/telegram/instant-view-media?kind=photo|document&id= -> a
//        picture of the page, downloaded through Telegram; `full=1` (a
//        document): the whole file by byte range for a video or audio,
//        `download=1` saved under its name (R-Y224; 400 for `full` on a
//        photo, 413 when over 64 MB)

import { json } from './util.js';
import { fromApp, answerFile } from './routes-telegram-files.js';
import { KINDS, targetOf } from '../sources/telegram-instant-view.js';

const ID = /^\d{1,20}$/;

const validHash = (hash) =>
  hash === undefined ||
  (Number.isInteger(hash) && hash >= 0 && hash <= 2 ** 31 - 1);

// The picture asked for, or null when the query is malformed.
const pictureQuery = (query) => {
  const kind = query.get('kind') ?? '';
  const id = query.get('id') ?? '';
  const full = query.get('full') === '1';
  return KINDS.includes(kind) && ID.test(id) && (!full || kind === 'document')
    ? { kind, id, full }
    : null;
};

// GET /api/telegram/instant-view-media?kind=&id= -> the picture, only for
// the app's own pages.
const handleMedia = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return json(res, 403, { error: 'pictures load only in the app' }) ?? true;
  }
  if (typeof account.instantViewFile !== 'function') {
    return json(res, 501, { error: 'instant view not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const asked = pictureQuery(query);
  if (!asked) {
    return json(res, 400, { error: 'bad picture' }) ?? true;
  }
  const result = await account.instantViewFile(asked);
  if (asked.full) {
    return answerFile(req, res, result, query, true);
  }
  if (!result?.buffer) {
    return json(res, 404, { error: 'no picture' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'image/jpeg',
    'content-length': result.buffer.length,
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

export const INSTANT_VIEW_GETS = { 'instant-view-media': handleMedia };

export const INSTANT_VIEW_POSTS = {
  'instant-view': async (account, body) =>
    typeof body.url === 'string' &&
    targetOf(body.url) &&
    validHash(body.hash) &&
    typeof account.instantView === 'function'
      ? [
          200,
          await account.instantView({
            url: body.url,
            ...(body.hash === undefined ? {} : { hash: body.hash }),
          }),
        ]
      : [400, { error: 'url required', code: 'bad-request' }],
};
