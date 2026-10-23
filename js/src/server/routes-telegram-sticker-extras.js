// Trending stickers, stickers in a photo, clearing the recent stickers, the
// quick reaction and custom emoji search (R-Y206): the routes of the POSTS
// table in routes-telegram.js, each validated strictly before the account
// is asked.
//
// Its routes:
//   POST /api/telegram/sticker-featured {emojis?, old?, offset?, limit?}
//                       -> { ok, count, sets: [{ id, title, count, format,
//                       emoji, installed, unread }], unread, next } the
//                       trending sticker sets (emojis: true, the trending
//                       custom emoji sets; old: true, further ones from
//                       offset, 1 to 100 a page, `next` the next offset)
//   POST /api/telegram/sticker-featured-read {ids} -> { ok } 1 to 200 set
//                       ids seen in the trending list
//   POST /api/telegram/sticker-recent-clear {} -> { ok } the recent
//                       stickers cleared
//   POST /api/telegram/sticker-attached {chat, id} -> { ok, sets } the
//                       sticker sets used in a stored photo or video
//   POST /api/telegram/quick-reaction {} -> { ok, emoji } the account's
//                       default (double-tap) reaction, emoji null if custom
//   POST /api/telegram/quick-reaction-set {emoji} -> { ok, emoji } a new
//                       one, a short emoji string
//   POST /api/telegram/custom-emoji-search {q} -> { ok, ids } the custom
//                       emoji for 1 to 64 characters, document ids

import {
  MAX_PAGE,
  MAX_READ,
  SET_ID,
} from '../sources/telegram-sticker-trending.js';
import { validEmoji } from '../sources/telegram-quick-reaction.js';
import { queryOf } from '../sources/telegram-custom-emoji-search.js';

const BAD = [400, { error: 'bad request', code: 'bad-request' }];
const flag = (v) => v === undefined || typeof v === 'boolean';
const whole = (v, min, max) =>
  v === undefined || (Number.isInteger(v) && v >= min && v <= max);

// A route that calls `account[method](arg(body))` once `valid(body)`.
const route =
  (method, valid, arg = (body) => body) =>
  async (account, body) =>
    typeof account[method] === 'function' && valid(body)
      ? [200, await account[method](arg(body))]
      : BAD;

const validFeatured = (b) =>
  flag(b.emojis) &&
  flag(b.old) &&
  whole(b.offset, 0, 100_000) &&
  whole(b.limit, 1, MAX_PAGE);

const validRead = (b) =>
  Array.isArray(b.ids) &&
  b.ids.length >= 1 &&
  b.ids.length <= MAX_READ &&
  b.ids.every((id) => SET_ID.test(String(id)));

const validAttached = (b) =>
  /^-?\d{1,20}$/.test(String(b.chat ?? '')) &&
  /^\d{1,12}$/.test(String(b.id ?? ''));

export const STICKER_EXTRAS_POSTS = {
  'sticker-featured': route('featuredStickers', validFeatured, (b) => ({
    emojis: b.emojis === true,
    old: b.old === true,
    ...(b.offset === undefined ? {} : { offset: b.offset }),
    ...(b.limit === undefined ? {} : { limit: b.limit }),
  })),
  'sticker-featured-read': route('featuredRead', validRead, (b) => ({
    ids: b.ids.map(String),
  })),
  'sticker-recent-clear': route(
    'recentStickersClear',
    () => true,
    () => ({})
  ),
  'sticker-attached': route('attachedStickers', validAttached, (b) => ({
    chat: String(b.chat),
    id: String(b.id),
  })),
  'quick-reaction': route(
    'quickReaction',
    () => true,
    () => ({})
  ),
  'quick-reaction-set': route(
    'quickReactionSet',
    (b) => validEmoji(b.emoji),
    (b) => ({ emoji: b.emoji })
  ),
  'custom-emoji-search': route(
    'customEmojiSearch',
    (b) => queryOf(b.q) !== null,
    (b) => ({ q: queryOf(b.q) })
  ),
};
