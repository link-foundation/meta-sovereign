// Posting a story (R-Y156): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.

import {
  CAPTION_MAX_PREMIUM,
  MAX_SELECTED,
  MAX_STORY_SECONDS,
  PERIODS,
  PRIVACIES,
} from '../sources/telegram-story-post.js';

const TOKEN = /^[0-9a-f]{32}$/;
const USER_ID = /^\d{1,20}$/;

const bad = (error) => [400, { error, code: 'bad-request' }];
const size = (n) => Number.isInteger(n) && n > 0 && n <= 20_000;

const videoOk = (body) =>
  Number(body.duration) > 0 &&
  Number(body.duration) <= MAX_STORY_SECONDS * 2 &&
  size(body.width) &&
  size(body.height);

const usersOk = (privacy, users) =>
  Array.isArray(users) &&
  users.length <= MAX_SELECTED &&
  users.every((id) => USER_ID.test(String(id))) &&
  (privacy !== 'selected' || users.length > 0);

const flagOk = (value) => value === undefined || typeof value === 'boolean';

const fieldsOk = (body) => {
  const { kind, privacy, caption = '', users = [], period } = body;
  return (
    TOKEN.test(String(body.token ?? '')) &&
    (kind === 'photo' || kind === 'video') &&
    PRIVACIES.includes(privacy) &&
    typeof caption === 'string' &&
    [...caption].length <= CAPTION_MAX_PREMIUM &&
    usersOk(privacy, users) &&
    (period === undefined || PERIODS.includes(period))
  );
};

// The request for the account, or null when the body is wrong.
const postOf = (body) => {
  const { kind, caption = '', users = [], period } = body;
  const ok =
    fieldsOk(body) &&
    flagOk(body.screenshots) &&
    flagOk(body.pinned) &&
    (kind === 'photo' || videoOk(body));
  if (!ok) {
    return null;
  }
  return {
    token: body.token,
    kind,
    privacy: body.privacy,
    caption,
    users: users.map(String),
    screenshots: body.screenshots !== false,
    pinned: body.pinned === true,
    ...(period ? { period } : {}),
    ...(kind === 'video'
      ? {
          duration: Number(body.duration),
          width: body.width,
          height: body.height,
        }
      : {}),
  };
};

export const STORY_POST_POSTS = {
  'story-can-post': async (account) =>
    typeof account.storyCanPost === 'function'
      ? [200, await account.storyCanPost()]
      : bad('stories unavailable'),
  'story-post': async (account, body) => {
    const request = postOf(body ?? {});
    return request && typeof account.storyPost === 'function'
      ? [200, await account.storyPost(request)]
      : bad('token, kind, privacy and caption required');
  },
};
