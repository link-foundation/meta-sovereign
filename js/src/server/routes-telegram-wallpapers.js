// Chat backgrounds (R-Y155): the routes of the POSTS and GETS tables in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/wallpapers {fresh?} -> { ok, wallpapers } the
//                       backgrounds Telegram offers (R-Y155): id, slug,
//                       kind image|pattern|colors, colours, intensity
//   POST /api/telegram/chat-wallpaper-set {chat, id} -> { ok } a listed
//                       wallpaper set for one chat, for the user only
//   GET  /api/telegram/wallpaper?id=&slug=&size=thumb|full -> the picture
//                       (a pattern as sanitized image/svg+xml)

import { json } from './util.js';
import { fromApp } from './routes-telegram-files.js';
import { ID, SLUG } from '../sources/telegram-wallpapers.js';

const SIZES = ['thumb', 'full'];

const validFile = (id, slug, size) =>
  ID.test(id) && (slug === '' || SLUG.test(slug)) && SIZES.includes(size);

// GET /api/telegram/wallpaper?id=&slug=&size= -> the wallpaper's picture
// (a pattern as sanitized SVG), only for the app's own pages.
const handleWallpaper = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return json(res, 403, { error: 'wallpapers load only in the app' }) ?? true;
  }
  if (typeof account.wallpaperFile !== 'function') {
    return json(res, 501, { error: 'wallpapers not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const id = query.get('id') ?? '';
  const slug = query.get('slug') ?? '';
  const size = query.get('size') || 'full';
  if (!validFile(id, slug, size)) {
    return json(res, 400, { error: 'bad wallpaper' }) ?? true;
  }
  const result = await account.wallpaperFile({ id, slug, size });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no wallpaper' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType,
    'content-length': result.buffer.length,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.end(result.buffer);
  return true;
};

export const WALLPAPER_GETS = { wallpaper: handleWallpaper };

export const WALLPAPER_POSTS = {
  wallpapers: async (account, body) =>
    typeof account.wallpapers === 'function' &&
    (body.fresh === undefined || typeof body.fresh === 'boolean')
      ? [200, await account.wallpapers({ fresh: body.fresh === true })]
      : [400, { error: 'bad request', code: 'bad-request' }],
  'chat-wallpaper-set': async (account, body) =>
    ID.test(String(body.chat ?? '')) &&
    ID.test(String(body.id ?? '')) &&
    typeof account.setChatWallpaper === 'function'
      ? [
          200,
          await account.setChatWallpaper({
            chat: String(body.chat),
            id: String(body.id),
          }),
        ]
      : [400, { error: 'chat and wallpaper required', code: 'bad-request' }],
};
