// Stories and music on a profile (R-Y185): the routes of the POSTS and
// GETS tables in routes-telegram.js, each validated strictly before the
// account is asked.
//
// Its routes:
//   POST /api/telegram/profile-stories {chat, album?, offset?} -> { ok,
//                       count, me, mine, stories, albums, next } a person's
//                       or channel's pinned stories, or one album's, 30 a
//                       page (the first page names the albums)
//   POST /api/telegram/stories-archive {offset?} -> { ok, count, me,
//                       stories, next } one's own archived stories
//   POST /api/telegram/story-pin {chat, ids, pinned} -> { ok, pinned, ids }
//                       stories shown on or taken off the profile (a
//                       write, on a click only)
//   POST /api/telegram/story-pin-top {chat, ids} -> { ok, ids } up to 3
//                       stories fixed at the top of the profile (a write,
//                       on a click only)
//   POST /api/telegram/saved-music {chat, offset?} -> { ok, count, mine,
//                       tracks, next } a person's saved songs, 30 a page
//   POST /api/telegram/music-save {chat, message, unsave?} -> { ok, id,
//                       saved } a song of a chat's audio message added to
//                       (or taken off) one's own profile music (a write,
//                       on a click only)
//   POST /api/telegram/music-remove {id} -> { ok, id } one of one's own
//                       tracks taken off the profile (a write, on a click)
//   GET  /api/telegram/music?id= -> the track's audio, by range, for the
//                       page's audio player (only the app's own pages)

import { json } from './util.js';
import { fromApp, sendBytes } from './routes-telegram-files.js';

const CHAT = /^-?\d{1,20}$/;
const ID = /^\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];
const natural = (n) => Number.isInteger(n) && n >= 0;
const ids = (list, max) =>
  Array.isArray(list) &&
  list.length <= max &&
  list.every((id) => Number.isInteger(id) && id > 0);

const route = (method, valid, error) => async (account, body) =>
  valid(body) && typeof account[method] === 'function'
    ? [200, await account[method](body)]
    : bad(error);

// GET /api/telegram/music?id= -> the audio, only for the app's own pages.
const handleMusic = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return json(res, 403, { error: 'music loads only in the app' }) ?? true;
  }
  if (typeof account.musicFile !== 'function') {
    return json(res, 501, { error: 'music not available' }) ?? true;
  }
  const id = new URL(req.url, 'http://local').searchParams.get('id') ?? '';
  if (!ID.test(id)) {
    return json(res, 400, { error: 'bad track' }) ?? true;
  }
  const result = await account.musicFile({ id });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no track' }) ?? true;
  }
  return sendBytes(req, res, result);
};

export const PROFILE_STORIES_GETS = { music: handleMusic };

export const PROFILE_STORIES_POSTS = {
  'profile-stories': route(
    'profileStories',
    (b) =>
      CHAT.test(String(b.chat ?? '')) &&
      (b.album === undefined || (Number.isInteger(b.album) && b.album > 0)) &&
      (b.offset === undefined || natural(b.offset)),
    'a chat, an optional album and an offset required'
  ),
  'stories-archive': route(
    'storiesArchive',
    (b) => b.offset === undefined || natural(b.offset),
    'an offset required'
  ),
  'story-pin': route(
    'storyPin',
    (b) =>
      CHAT.test(String(b.chat ?? '')) &&
      ids(b.ids, 30) &&
      b.ids.length > 0 &&
      typeof b.pinned === 'boolean',
    'a chat, story ids and pinned required'
  ),
  'story-pin-top': route(
    'storyPinTop',
    (b) => CHAT.test(String(b.chat ?? '')) && ids(b.ids, 3),
    'a chat and up to 3 story ids required'
  ),
  'saved-music': route(
    'savedMusic',
    (b) =>
      CHAT.test(String(b.chat ?? '')) &&
      (b.offset === undefined || natural(b.offset)),
    'a person and an offset required'
  ),
  'music-save': route(
    'messageMusicSave',
    (b) =>
      CHAT.test(String(b.chat ?? '')) &&
      Number.isInteger(b.message) &&
      b.message > 0 &&
      (b.unsave === undefined || typeof b.unsave === 'boolean'),
    'a chat and a message required'
  ),
  'music-remove': route(
    'musicRemove',
    (b) => ID.test(String(b.id ?? '')),
    'a track required'
  ),
};
