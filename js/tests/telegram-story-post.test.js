// Posting a story (R-Y156): the limit asked first, the privacy rules of
// each choice, the sendStory request for a photo and a video, Telegram's
// errors as codes, the routes' validation and the page's pure helpers.
// Fake clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createStoryPost,
  privacyRules,
  videoMime,
} from '../src/sources/telegram-story-post.js';
import {
  captionLimit,
  errorKey,
  kindOf,
  limitOf,
  postBody,
  problemOf,
} from '../src/web/story-post-model.js';
import {
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const Api = {
  InputPeerSelf: named('InputPeerSelf'),
  InputUser: named('InputUser'),
  InputMediaUploadedPhoto: named('InputMediaUploadedPhoto'),
  InputMediaUploadedDocument: named('InputMediaUploadedDocument'),
  DocumentAttributeVideo: named('DocumentAttributeVideo'),
  InputPrivacyValueAllowAll: named('InputPrivacyValueAllowAll'),
  InputPrivacyValueAllowContacts: named('InputPrivacyValueAllowContacts'),
  InputPrivacyValueAllowCloseFriends: named(
    'InputPrivacyValueAllowCloseFriends'
  ),
  InputPrivacyValueAllowUsers: named('InputPrivacyValueAllowUsers'),
  contacts: { GetContacts: named('GetContacts') },
  stories: {
    CanSendStory: named('CanSendStory'),
    SendStory: named('SendStory'),
  },
};

const TOKEN = 'a'.repeat(32);

const make = (answer, { premium = false } = {}) => {
  const log = [];
  const client = {
    ...fakeClient(answer, log),
    getMe: async () => ({ id: 7n, firstName: 'Me', premium }),
  };
  const dropped = [];
  const env = {
    importer: async () => ({
      Api,
      helpers: {
        ...helpers,
        readBigIntFromBuffer: (bytes) => BigInt(bytes.length),
      },
      client: {
        uploads: {
          CustomFile: class {
            constructor(name, size, path) {
              Object.assign(this, { name, size, path });
            }
          },
        },
      },
    }),
  };
  const context = {
    userClient: async () => client,
    uploads: {
      uploadOf: (token) =>
        token === TOKEN ? { path: '/tmp/x', name: 'clip.mov', size: 10 } : null,
      dropUpload: async (token) => dropped.push(token),
    },
  };
  return { actions: createStoryPost(env, context), log, dropped };
};

const answers = (request) => {
  if (request.className === 'GetContacts') {
    return { users: [{ id: 5n, accessHash: 9n }] };
  }
  return request.className === 'CanSendStory'
    ? { countRemains: 3 }
    : { className: 'Updates' };
};

const base = {
  token: TOKEN,
  kind: 'photo',
  caption: 'hi',
  privacy: 'everyone',
  users: [],
  screenshots: true,
  pinned: false,
};

const sent = (log) => log.find((r) => r.className === 'SendStory');

test('canSendStory is asked for the user, with the caption limit', async () => {
  const free = make(answers);
  const answer = await free.actions.storyCanPost();
  assert.equal(free.log[0].className, 'CanSendStory');
  assert.equal(free.log[0].peer.className, 'InputPeerSelf');
  assert.equal(answer.ok, true);
  assert.equal(answer.remains, 3);
  assert.equal(answer.captionMax, 200);
  assert.equal(answer.me.id, '7');
  const premium = make(answers, { premium: true });
  assert.equal((await premium.actions.storyCanPost()).captionMax, 2048);
});

test('a reached limit becomes a code', async () => {
  const limit = make(() => telegramError('STORIES_TOO_MUCH'));
  assert.deepEqual((await limit.actions.storyCanPost()).code, 'too-many');
  const needs = make(() => telegramError('PREMIUM_ACCOUNT_REQUIRED'));
  assert.equal((await needs.actions.storyCanPost()).code, 'premium');
});

test('each privacy choice makes its rule', () => {
  const only = (privacy, users) =>
    privacyRules(Api, privacy, users).map((r) => r.className);
  assert.deepEqual(only('everyone'), ['InputPrivacyValueAllowAll']);
  assert.deepEqual(only('contacts'), ['InputPrivacyValueAllowContacts']);
  assert.deepEqual(only('close-friends'), [
    'InputPrivacyValueAllowCloseFriends',
  ]);
  const users = [new Api.InputUser({ userId: 5n })];
  const rules = privacyRules(Api, 'selected', users);
  assert.equal(rules[0].className, 'InputPrivacyValueAllowUsers');
  assert.equal(rules[0].users, users);
});

test('a photo is sent as an uploaded photo to oneself', async () => {
  const { actions, log, dropped } = make(answers);
  const result = await actions.storyPost({
    ...base,
    privacy: 'contacts',
    pinned: true,
    screenshots: false,
  });
  assert.deepEqual(result, { ok: true });
  const request = sent(log);
  assert.equal(request.peer.className, 'InputPeerSelf');
  assert.equal(request.media.className, 'InputMediaUploadedPhoto');
  assert.equal(request.media.file.className, 'InputFile');
  assert.equal(request.caption, 'hi');
  assert.equal(request.noforwards, true);
  assert.equal(request.pinned, true);
  assert.equal(request.period, undefined);
  assert.equal(request.privacyRules.length, 1);
  assert.equal(
    request.privacyRules[0].className,
    'InputPrivacyValueAllowContacts'
  );
  assert.equal(typeof request.randomId, 'bigint');
  assert.deepEqual(dropped, [TOKEN]);
});

test('a video is a streaming document with its length and size', async () => {
  const { actions, log } = make(answers);
  await actions.storyPost({
    ...base,
    kind: 'video',
    duration: 12.5,
    width: 720,
    height: 1280,
    period: 43_200,
  });
  const request = sent(log);
  assert.equal(request.media.className, 'InputMediaUploadedDocument');
  assert.equal(request.media.mimeType, 'video/quicktime');
  const [attribute] = request.media.attributes;
  assert.equal(attribute.className, 'DocumentAttributeVideo');
  assert.equal(attribute.supportsStreaming, true);
  assert.equal(attribute.duration, 12.5);
  assert.equal(attribute.w, 720);
  assert.equal(attribute.h, 1280);
  assert.equal(request.period, 43_200);
  assert.equal(request.noforwards, undefined);
  assert.equal(videoMime('a.webm'), 'video/webm');
  assert.equal(videoMime('a'), 'video/mp4');
});

test('selected contacts become input users; strangers are refused', async () => {
  const { actions, log } = make(answers);
  await actions.storyPost({ ...base, privacy: 'selected', users: ['5'] });
  const [rule] = sent(log).privacyRules;
  assert.equal(rule.className, 'InputPrivacyValueAllowUsers');
  assert.equal(rule.users[0].className, 'InputUser');
  assert.equal(rule.users[0].userId, 5n);
  assert.equal(rule.users[0].accessHash, 9n);
  const stranger = await actions.storyPost({
    ...base,
    privacy: 'selected',
    users: ['6'],
  });
  assert.equal(stranger.code, 'users-invalid');
  const none = await actions.storyPost({ ...base, privacy: 'selected' });
  assert.equal(none.code, 'users-invalid');
});

test('errors become codes with words', async () => {
  const fails = (name) => make(() => telegramError(name));
  const code = async (name, request = base) =>
    (await fails(name).actions.storyPost(request)).code;
  // (The contacts call is not asked for a non-selected story: the first
  // request is the send itself.)
  assert.equal(await code('STORIES_TOO_MUCH'), 'too-many');
  assert.equal(await code('PREMIUM_ACCOUNT_REQUIRED'), 'premium');
  assert.equal(await code('MEDIA_INVALID'), 'media-invalid');
  assert.equal(await code('FLOOD_WAIT_30'), 'flood');
  const long = await make(answers).actions.storyPost({
    ...base,
    kind: 'video',
    duration: 75,
    width: 10,
    height: 10,
  });
  assert.equal(long.code, 'video-too-long');
  assert.equal(
    (await make(answers).actions.storyPost({ ...base, token: 'zz' })).code,
    'failed'
  );
  const lost = make(answers);
  assert.equal(
    (await lost.actions.storyPost({ ...base, token: 'b'.repeat(32) })).code,
    'media-invalid'
  );
  for (const key of [
    'too-many',
    'premium',
    'media-invalid',
    'video-too-long',
    'flood',
  ]) {
    assert.equal(errorKey(key), `chat.storyPost.err.${key}`);
  }
  assert.equal(errorKey('other'), 'chat.storyPost.err.failed');
});

test('the routes validate their bodies', async () => {
  const calls = [];
  const account = {
    storyCanPost: async () => ({ ok: true }),
    storyPost: async (r) => calls.push(r) && { ok: true },
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('story-can-post', {}), 200);
  assert.equal(await status('story-post', base), 200);
  assert.equal(calls[0].screenshots, true);
  assert.equal(
    await status('story-post', { ...base, privacy: 'selected', users: ['5'] }),
    200
  );
  const video = { ...base, kind: 'video', duration: 9, width: 4, height: 8 };
  assert.equal(await status('story-post', video), 200);
  const wrong = [
    { ...base, token: 'nope' },
    { ...base, kind: 'gif' },
    { ...base, privacy: 'nobody' },
    { ...base, privacy: 'selected', users: [] },
    { ...base, users: ['x'] },
    { ...base, caption: 5 },
    { ...base, caption: 'x'.repeat(2049) },
    { ...base, period: 100 },
    { ...base, pinned: 'yes' },
    { ...base, screenshots: 1 },
    { ...video, duration: 0 },
    { ...video, width: 0 },
    { ...video, height: 1.5 },
  ];
  for (const body of wrong) {
    assert.equal(await status('story-post', body), 400, JSON.stringify(body));
  }
  assert.equal(calls.length, 3);
});

test('the page helpers', () => {
  assert.equal(kindOf({ type: 'image/png', name: 'a.png' }), 'photo');
  assert.equal(kindOf({ type: 'video/mp4', name: 'a.mp4' }), 'video');
  assert.equal(kindOf({ type: '', name: 'a.MOV' }), 'video');
  assert.equal(kindOf({ type: 'application/pdf', name: 'a.pdf' }), null);
  assert.equal(captionLimit(null), 200);
  assert.equal(captionLimit({ captionMax: 2048 }), 2048);
  assert.equal(limitOf({ ok: true, remains: 2 }), null);
  assert.equal(limitOf({ ok: true, remains: 0 }), 'too-many');
  assert.equal(limitOf({ ok: false, code: 'premium' }), 'premium');
  assert.equal(limitOf(null), 'failed');
  const one = { kind: 'photo', privacy: 'everyone', users: [], caption: '' };
  assert.equal(problemOf(one), null);
  assert.equal(
    problemOf({ ...one, kind: 'video', duration: 61 }),
    'video-too-long'
  );
  assert.equal(problemOf({ ...one, privacy: 'selected' }), 'users-invalid');
  assert.equal(
    problemOf({ ...one, caption: 'x'.repeat(201) }),
    'caption-too-long'
  );
  const options = {
    caption: ' hi ',
    privacy: 'selected',
    users: new Set(['5']),
    screenshots: false,
    pinned: true,
    period: 43_200,
  };
  const body = postBody({
    token: 't',
    kind: 'photo',
    options,
    info: { premium: false },
  });
  assert.equal(body.caption, 'hi');
  assert.deepEqual(body.users, ['5']);
  assert.equal(body.period, undefined);
  assert.equal(
    postBody({ token: 't', kind: 'photo', options, info: { premium: true } })
      .period,
    43_200
  );
});
