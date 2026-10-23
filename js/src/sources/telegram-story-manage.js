/**
 * Managing one's own stories, as Telegram Desktop does (R-Y210; learned,
 * never copied). Deleting, the viewers, pinning and the archive are in
 * ./telegram-story-actions.js and ./telegram-profile-stories.js; here:
 * - `storyEdit({ chat, id, caption?, privacy?, users? })` — a story's
 *   caption and/or whom it is for (stories.editStory with `caption` +
 *   `entities`, or `privacyRules`; `privacy` is `everyone`, `contacts`,
 *   `close-friends` or `selected` with `users` ids of contacts) →
 *   `{ ok, caption?, entities?, privacy? }`. A caption is markdown, as
 *   the composer's (./telegram-format.js), sent as text and entities;
 * - `storyLink({ chat, id })` — the t.me link of a story
 *   (stories.exportStoryLink) → `{ ok, link }`.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { apiEntities, parseFormatted, rawEntities } from './telegram-format.js';
import {
  CAPTION_MAX_PREMIUM,
  PRIVACIES,
  MAX_SELECTED,
  inputUsersOf,
  privacyRules,
} from './telegram-story-post.js';
import { badRequest, storyOk } from './telegram-story-actions.js';

const CODES = {
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ADMIN_REQUIRED: 'no-access',
  STORY_ID_INVALID: 'gone',
  STORY_NOT_MODIFIED: 'unchanged',
  MEDIA_CAPTION_TOO_LONG: 'caption-too-long',
  USER_ID_INVALID: 'users-invalid',
  PRIVACY_PARTICIPANT_INVALID: 'users-invalid',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const USER_ID = /^\d{1,20}$/;
const bad = (code) => ({ ok: false, error: code, code });

// What is wrong with an edit request, as a code, or null.
export const editProblem = (r) => {
  if (!storyOk(r)) {
    return 'failed';
  }
  const hasCaption = r.caption !== undefined;
  if (!hasCaption && r.privacy === undefined) {
    return 'failed';
  }
  if (
    hasCaption &&
    !(
      typeof r.caption === 'string' &&
      [...r.caption].length <= CAPTION_MAX_PREMIUM
    )
  ) {
    return 'caption-too-long';
  }
  if (r.privacy === undefined) {
    return null;
  }
  if (!PRIVACIES.includes(r.privacy)) {
    return 'failed';
  }
  const ids = r.users;
  return r.privacy !== 'selected' ||
    (Array.isArray(ids) &&
      ids.length > 0 &&
      ids.length <= MAX_SELECTED &&
      ids.every((id) => USER_ID.test(String(id))))
    ? null
    : 'users-invalid';
};

const withStory = (env, userClient, request, key, use) =>
  connected(env, userClient, failure, (c) =>
    runIn(env, `${key}:${request.chat}`, () =>
      env.connection.withPeer(c.client, String(request.chat), (peer) =>
        use(c, peer)
      )
    )
  );

const edit = (env, userClient) => async (request) => {
  const problem = editProblem(request ?? {});
  if (problem) {
    return bad(problem);
  }
  return withStory(env, userClient, request, 'story-edit', async (c, peer) => {
    const users =
      request.privacy === 'selected'
        ? await inputUsersOf(env, c, request.users)
        : [];
    if (!users) {
      return bad('users-invalid');
    }
    const formatted =
      request.caption === undefined ? null : parseFormatted(request.caption);
    await c.client.invoke(
      new c.Api.stories.EditStory({
        peer,
        id: request.id,
        ...(formatted
          ? {
              caption: formatted.text,
              entities: apiEntities(c.Api, formatted.entities),
            }
          : {}),
        ...(request.privacy === undefined
          ? {}
          : { privacyRules: privacyRules(c.Api, request.privacy, users) }),
      })
    );
    return {
      ok: true,
      ...(formatted
        ? {
            caption: formatted.text,
            entities: rawEntities(formatted.entities),
          }
        : {}),
      ...(request.privacy === undefined ? {} : { privacy: request.privacy }),
    };
  });
};

const link = (env, userClient) => async (request) => {
  if (!storyOk(request)) {
    return badRequest;
  }
  return withStory(env, userClient, request, 'story-link', async (c, peer) => {
    const answer = await c.client.invoke(
      new c.Api.stories.ExportStoryLink({ peer, id: request.id })
    );
    return answer?.link
      ? { ok: true, link: String(answer.link) }
      : bad('failed');
  });
};

export const createStoryManage = (env, { userClient }) => ({
  storyEdit: edit(env, userClient),
  storyLink: link(env, userClient),
});
