// Managing one's own stories (R-Y210): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/story-edit {chat, id, caption?, privacy?, users?} ->
//                       { ok, caption?, privacy? } a story's caption and/or
//                       whom it is for (everyone | contacts | close-friends
//                       | selected + users); at least one of caption and
//                       privacy (a write, on a click only)
//   POST /api/telegram/story-link {chat, id} -> { ok, link } the t.me link
//                       of a story

import { editProblem } from '../sources/telegram-story-manage.js';

const CHAT = /^-?\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];

const storyId = (b) =>
  CHAT.test(String(b.chat ?? '')) && Number.isInteger(b.id) && b.id > 0;

const run = (method, what, ok, build) => async (account, body) =>
  ok(body) && typeof account[method] === 'function'
    ? [200, await account[method](build(body))]
    : bad(what);

const pick = (body, keys) =>
  Object.fromEntries(
    keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])
  );

export const STORY_MANAGE_POSTS = {
  'story-edit': run(
    'storyEdit',
    'chat, id and a caption or privacy required',
    (b) => editProblem(b) === null,
    (b) => ({
      chat: String(b.chat),
      id: b.id,
      ...pick(b, ['caption', 'privacy', 'users']),
    })
  ),
  'story-link': run('storyLink', 'chat and id required', storyId, (b) => ({
    chat: String(b.chat),
    id: b.id,
  })),
};
