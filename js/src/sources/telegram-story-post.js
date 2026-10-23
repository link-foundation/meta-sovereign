/**
 * Posting a story, as Telegram Desktop does (R-Y156; learned, never
 * copied):
 * - `storyCanPost()` — stories.canSendStory for the user (InputPeerSelf)
 *   → `{ ok: true, remains, premium, me: { id, name }, captionMax }`; when the limit is
 *   reached Telegram's answer becomes `{ ok: false, code: 'too-many' }`
 *   (`'premium'` when only Premium may post);
 * - `storyPost({ token, kind, caption, privacy, users, screenshots,
 *   pinned, period, duration, width, height })` — the page's upload
 *   (./telegram-upload.js) sent with stories.sendStory as the user's own
 *   story: a photo as InputMediaUploadedPhoto, a video as
 *   InputMediaUploadedDocument with DocumentAttributeVideo (streaming,
 *   length, size). `privacy` is `everyone`, `contacts`, `close-friends`
 *   or `selected` (then `users` are ids of contacts); `screenshots`
 *   false means `noforwards`; `pinned` keeps it on the profile; `period`
 *   (Premium) is 6, 12, 24 or 48 hours in seconds.
 * Telegram's errors become codes the page shows as words.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { uploadedFile } from './telegram-chat-edit.js';
import { randomIdOf } from './telegram-send.js';

const CODES = {
  STORIES_TOO_MUCH: 'too-many',
  STORIES_SEND_LIMIT: 'too-many',
  STORY_SEND_FLOOD: 'too-many',
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  MEDIA_INVALID: 'media-invalid',
  MEDIA_EMPTY: 'media-invalid',
  PHOTO_INVALID_DIMENSIONS: 'media-invalid',
  IMAGE_PROCESS_FAILED: 'media-invalid',
  VIDEO_CONTENT_TYPE_INVALID: 'media-invalid',
  MEDIA_VIDEO_STORY_TOO_LONG: 'video-too-long',
  STORY_VIDEO_TOO_LONG: 'video-too-long',
  USER_ID_INVALID: 'users-invalid',
  PRIVACY_PARTICIPANT_INVALID: 'users-invalid',
  MEDIA_CAPTION_TOO_LONG: 'caption-too-long',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

/** Telegram allows a story video of a minute at most. */
export const MAX_STORY_SECONDS = 60;
/** The caption: 200 characters, 2048 with Premium. */
export const CAPTION_MAX = 200;
export const CAPTION_MAX_PREMIUM = 2048;
/** The hours a story may last (Premium chooses), in seconds. */
export const PERIODS = [21_600, 43_200, 86_400, 172_800];
export const PRIVACIES = ['everyone', 'contacts', 'close-friends', 'selected'];
export const MAX_SELECTED = 1000;

const TOKEN = /^[0-9a-f]{32}$/;
const USER_ID = /^\d{1,20}$/;
const VIDEO_MIME = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

const bad = (code) => ({ ok: false, error: code, code });
const textOf = (value) => String(value?.value ?? value);
const whole = (value) => Math.max(1, Math.round(Number(value) || 0));

/** The mime type a video's name says (MP4 when unknown). */
export const videoMime = (name) =>
  VIDEO_MIME[/\.([a-z0-9]+)$/i.exec(String(name ?? ''))?.[1]?.toLowerCase()] ??
  'video/mp4';

/**
 * Whom a story is for, as Telegram's rules: everyone, contacts, close
 * friends, or the chosen contacts (`inputUsers`, built by the caller).
 */
export const privacyRules = (Api, privacy, inputUsers = []) => {
  if (privacy === 'contacts') {
    return [new Api.InputPrivacyValueAllowContacts()];
  }
  if (privacy === 'close-friends') {
    return [new Api.InputPrivacyValueAllowCloseFriends()];
  }
  if (privacy === 'selected') {
    return [new Api.InputPrivacyValueAllowUsers({ users: inputUsers })];
  }
  return [new Api.InputPrivacyValueAllowAll()];
};

// The media: a photo, or a video with its attribute.
const mediaOf = (c, file, request, name) => {
  if (request.kind !== 'video') {
    return new c.Api.InputMediaUploadedPhoto({ file });
  }
  return new c.Api.InputMediaUploadedDocument({
    file,
    mimeType: videoMime(name),
    attributes: [
      new c.Api.DocumentAttributeVideo({
        supportsStreaming: true,
        duration: Number(request.duration) || 0,
        w: whole(request.width),
        h: whole(request.height),
      }),
    ],
  });
};

const selectedProblem = (r) => {
  if (r.privacy !== 'selected') {
    return null;
  }
  const ids = r.users;
  const ok =
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= MAX_SELECTED &&
    ids.every((id) => USER_ID.test(String(id)));
  return ok ? null : 'users-invalid';
};

const videoProblem = (r) => {
  if (r.kind !== 'video') {
    return null;
  }
  if (!(Number(r.duration) > 0)) {
    return 'failed';
  }
  return Number(r.duration) > MAX_STORY_SECONDS + 0.5 ? 'video-too-long' : null;
};

// What is wrong with the request, as a code, or null.
const problemOf = (request) => {
  const r = request ?? {};
  if (
    !TOKEN.test(String(r.token ?? '')) ||
    (r.kind !== 'photo' && r.kind !== 'video') ||
    !PRIVACIES.includes(r.privacy) ||
    (r.period !== undefined && !PERIODS.includes(r.period))
  ) {
    return 'failed';
  }
  if (
    typeof r.caption !== 'string' ||
    [...r.caption].length > CAPTION_MAX_PREMIUM
  ) {
    return 'caption-too-long';
  }
  return videoProblem(r) ?? selectedProblem(r);
};

// The chosen contacts as InputUsers (their access hashes come from the
// contacts list); null when one is not a contact.
export const inputUsersOf = async (env, c, ids) => {
  const answer = await runIn(env, 'contacts:list', () =>
    c.client.invoke(new c.Api.contacts.GetContacts({ hash: c.zero }))
  );
  const byId = new Map((answer?.users ?? []).map((u) => [textOf(u.id), u]));
  const chosen = [...new Set(ids.map(String))].map((id) => byId.get(id));
  return chosen.every(Boolean)
    ? chosen.map(
        (u) =>
          new c.Api.InputUser({
            userId: u.id,
            accessHash: u.accessHash ?? c.zero,
          })
      )
    : null;
};

const canPost = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const answer = await runIn(env, 'story-can-post', () =>
      c.client.invoke(
        new c.Api.stories.CanSendStory({ peer: new c.Api.InputPeerSelf() })
      )
    );
    const me = await c.client.getMe?.().catch(() => null);
    const premium = Boolean(me?.premium);
    return {
      ok: true,
      remains: Number(answer?.countRemains ?? 0),
      premium,
      me: me
        ? {
            id: textOf(me.id),
            name:
              [me.firstName, me.lastName].filter(Boolean).join(' ') ||
              me.username ||
              '',
          }
        : null,
      captionMax: premium ? CAPTION_MAX_PREMIUM : CAPTION_MAX,
    };
  });

const send = async (c, uploads, request) => {
  const entry = uploads?.uploadOf?.(request.token);
  const users =
    request.privacy === 'selected'
      ? await inputUsersOf(c.env, c, request.users)
      : [];
  if (!users) {
    return bad('users-invalid');
  }
  const file = await uploadedFile(c, uploads, request.token);
  if (!file) {
    return bad('media-invalid');
  }
  await runIn(c.env, 'story-post', () =>
    c.client.invoke(
      new c.Api.stories.SendStory({
        peer: new c.Api.InputPeerSelf(),
        media: mediaOf(c, file, request, entry?.name),
        privacyRules: privacyRules(c.Api, request.privacy, users),
        caption: request.caption,
        randomId: randomIdOf(null, 0, c.helpers),
        ...(request.screenshots === false ? { noforwards: true } : {}),
        ...(request.pinned === true ? { pinned: true } : {}),
        ...(request.period ? { period: request.period } : {}),
      })
    )
  );
  return { ok: true };
};

const post =
  (env, { userClient, uploads }) =>
  async (request) => {
    const problem = problemOf(request);
    const token = String(request?.token ?? '');
    try {
      if (problem) {
        return bad(problem);
      }
      return await connected(env, userClient, failure, (c) =>
        send({ ...c, env }, uploads, request)
      );
    } finally {
      if (TOKEN.test(token)) {
        await uploads?.dropUpload?.(token);
      }
    }
  };

/** `context.uploads` has the page's uploads (`uploadOf`, `dropUpload`). */
export const createStoryPost = (env, context) => ({
  storyCanPost: canPost(env, context.userClient),
  storyPost: post(env, context),
});
