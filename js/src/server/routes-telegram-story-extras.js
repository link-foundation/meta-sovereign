// The rest of the story features (R-Y199): the routes of the POSTS table
// in routes-telegram.js, each validated strictly before the account is
// asked.
//
// Its routes:
//   POST /api/telegram/story-stealth {past, future} -> { ok, stealth:
//                       { activeUntil, cooldownUntil } | null } stealth
//                       mode (Premium); at least one flag is true
//   POST /api/telegram/story-reactions {chat, id, offset?, reaction?,
//                       forwardsFirst?} -> { ok, count, views, next } the
//                       "Reactions" view of one's own story's viewers
//   POST /api/telegram/story-report {chat, id, option?, message?} -> { ok,
//                       result: choose (title, options) | comment
//                       (optional, option) | reported } as peer-report
//   POST /api/telegram/stories-views {chat, ids} -> { ok, stories: [{ id,
//                       views, reactions, forwards }] } fresh counters of
//                       one's own stories (1 to 100 ids)

const CHAT = /^-?\d{1,20}$/;
const OFFSET = /^[A-Za-z0-9+/=_.-]{0,256}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const bad = (error) => [400, { error, code: 'bad-request' }];

const storyId = (body) =>
  CHAT.test(String(body.chat ?? '')) &&
  Number.isInteger(body.id) &&
  body.id > 0;

const optional = (value, ok) => value === undefined || ok(value);

// A route that asks the account's `method` when `ok(body)` holds.
const route = (method, what, ok, build) => async (account, body) =>
  ok(body) && typeof account[method] === 'function'
    ? [200, await account[method](build(body))]
    : bad(what);

const pick = (body, keys) =>
  Object.fromEntries(
    keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])
  );

export const STORY_EXTRAS_POSTS = {
  'story-stealth': route(
    'storyStealth',
    'past and future required',
    (b) =>
      typeof b.past === 'boolean' &&
      typeof b.future === 'boolean' &&
      (b.past || b.future),
    (b) => ({ past: b.past, future: b.future })
  ),
  'story-reactions': route(
    'storyReactions',
    'chat and id required',
    (b) =>
      storyId(b) &&
      optional(b.offset, (v) => typeof v === 'string' && OFFSET.test(v)) &&
      optional(
        b.reaction,
        (v) => typeof v === 'string' && v.length > 0 && v.length <= 24
      ) &&
      optional(b.forwardsFirst, (v) => typeof v === 'boolean'),
    (b) => ({
      chat: String(b.chat),
      id: b.id,
      ...pick(b, ['offset', 'reaction', 'forwardsFirst']),
    })
  ),
  'story-report': route(
    'storyReport',
    'chat and id required',
    (b) =>
      storyId(b) &&
      optional(
        b.option,
        (v) => typeof v === 'string' && v.length <= 2048 && BASE64.test(v)
      ) &&
      optional(b.message, (v) => typeof v === 'string' && v.length <= 512),
    (b) => ({
      chat: String(b.chat),
      id: b.id,
      ...pick(b, ['option', 'message']),
    })
  ),
  'stories-views': route(
    'storiesViews',
    'chat and ids required',
    (b) =>
      CHAT.test(String(b.chat ?? '')) &&
      Array.isArray(b.ids) &&
      b.ids.length > 0 &&
      b.ids.length <= 100 &&
      b.ids.every((id) => Number.isInteger(id) && id > 0),
    (b) => ({ chat: String(b.chat), ids: b.ids })
  ),
};
