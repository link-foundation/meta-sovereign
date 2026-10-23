// Managing one's own stories (R-Y210): editing the caption or the audience,
// the story's link, the story's new pinned/privacy fields, the routes'
// validation and the page's pure helpers. Fake clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStoryManage } from '../src/sources/telegram-story-manage.js';
import { shapeStory } from '../src/sources/telegram-stories.js';
import {
  editBody,
  editProblem,
  editedStory,
  manageError,
  manageKeys,
  captionForEdit,
  manageLabel,
} from '../src/web/story-manage-model.js';
import {
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const Api = {
  InputUser: named('InputUser'),
  MessageEntityBold: named('MessageEntityBold'),
  InputPrivacyValueAllowAll: named('InputPrivacyValueAllowAll'),
  InputPrivacyValueAllowContacts: named('InputPrivacyValueAllowContacts'),
  InputPrivacyValueAllowCloseFriends: named(
    'InputPrivacyValueAllowCloseFriends'
  ),
  InputPrivacyValueAllowUsers: named('InputPrivacyValueAllowUsers'),
  contacts: { GetContacts: named('GetContacts') },
  stories: {
    EditStory: named('EditStory'),
    ExportStoryLink: named('ExportStoryLink'),
  },
};

const make = (answer) => {
  const log = [];
  const client = fakeClient(answer, log);
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ peer: chat }) },
  };
  return {
    actions: createStoryManage(env, { userClient: async () => client }),
    log,
  };
};

test('editing a caption sends its text and its formatting', async () => {
  const { actions, log } = make(() => ({}));
  const got = await actions.storyEdit({ chat: '7', id: 3, caption: 'New' });
  assert.deepEqual(got, { ok: true, caption: 'New', entities: [] });
  assert.equal(log[0].className, 'EditStory');
  assert.equal(log[0].id, 3);
  assert.equal(log[0].peer.peer, '7');
  assert.equal(log[0].caption, 'New');
  assert.deepEqual(log[0].entities, []);
  assert.equal(log[0].privacyRules, undefined);
  // An empty caption clears it.
  assert.equal(
    (await actions.storyEdit({ chat: '7', id: 3, caption: '' })).ok,
    true
  );
  assert.equal(log[1].caption, '');
  // Markdown, as the composer's, goes as entities and comes back for the page.
  const bold = await actions.storyEdit({
    chat: '7',
    id: 3,
    caption: 'a **big** day',
  });
  assert.equal(log[2].caption, 'a big day');
  assert.equal(log[2].entities[0].className, 'MessageEntityBold');
  assert.equal(log[2].entities[0].offset, 2);
  assert.equal(log[2].entities[0].length, 3);
  assert.deepEqual(bold.entities, [
    { className: 'MessageEntityBold', offset: 2, length: 3 },
  ]);
  // The edit box starts from the caption as markdown, and the story
  // takes the answer's formatting.
  assert.equal(
    captionForEdit({ caption: 'a big day', entities: bold.entities }),
    'a **big** day'
  );
  assert.deepEqual(
    editedStory({ id: 3, caption: 'old' }, bold).entities,
    bold.entities
  );
});

test('editing the audience sends privacy rules, not the caption', async () => {
  const { actions, log } = make((request) =>
    request.className === 'GetContacts'
      ? { users: [{ id: 5n, accessHash: 9n }] }
      : {}
  );
  assert.deepEqual(
    await actions.storyEdit({ chat: '7', id: 3, privacy: 'close-friends' }),
    { ok: true, privacy: 'close-friends' }
  );
  assert.equal(
    log[0].privacyRules[0].className,
    'InputPrivacyValueAllowCloseFriends'
  );
  assert.equal(log[0].caption, undefined);
  await actions.storyEdit({ chat: '7', id: 3, privacy: 'contacts' });
  assert.equal(
    log.at(-1).privacyRules[0].className,
    'InputPrivacyValueAllowContacts'
  );
  const chosen = await actions.storyEdit({
    chat: '7',
    id: 3,
    privacy: 'selected',
    users: ['5'],
  });
  assert.equal(chosen.ok, true);
  const rule = log.at(-1).privacyRules[0];
  assert.equal(rule.className, 'InputPrivacyValueAllowUsers');
  assert.equal(rule.users[0].userId, 5n);
  // A person who is not a contact is refused before editing.
  const before = log.length;
  const other = await actions.storyEdit({
    chat: '7',
    id: 3,
    privacy: 'selected',
    users: ['6'],
  });
  assert.equal(other.code, 'users-invalid');
  assert.equal(
    log.slice(before).some((r) => r.className === 'EditStory'),
    false
  );
});

test('bad edits never reach Telegram', async () => {
  const { actions, log } = make(() => ({}));
  for (const request of [
    { chat: 'x', id: 3, caption: 'a' },
    { chat: '7', id: 0, caption: 'a' },
    { chat: '7', id: 3 },
    { chat: '7', id: 3, caption: 5 },
    { chat: '7', id: 3, caption: 'a'.repeat(2049) },
    { chat: '7', id: 3, privacy: 'nobody' },
    { chat: '7', id: 3, privacy: 'selected', users: [] },
    { chat: '7', id: 3, privacy: 'selected', users: ['x'] },
    undefined,
  ]) {
    assert.equal((await actions.storyEdit(request)).ok, false);
  }
  assert.equal(log.length, 0);
});

test('Telegram errors of an edit become codes', async () => {
  for (const [error, code] of [
    ['STORY_ID_INVALID', 'gone'],
    ['CHAT_ADMIN_REQUIRED', 'no-access'],
    ['MEDIA_CAPTION_TOO_LONG', 'caption-too-long'],
    ['SOMETHING_ELSE', 'failed'],
  ]) {
    const { actions } = make(() => telegramError(error));
    const got = await actions.storyEdit({ chat: '7', id: 3, caption: 'a' });
    assert.equal(got.ok, false);
    assert.equal(got.code, code);
  }
});

test('a story link is exported, or refused', async () => {
  const { actions, log } = make(() => ({ link: 'https://t.me/ann/s/3' }));
  assert.deepEqual(await actions.storyLink({ chat: '7', id: 3 }), {
    ok: true,
    link: 'https://t.me/ann/s/3',
  });
  assert.equal(log[0].className, 'ExportStoryLink');
  assert.equal(log[0].id, 3);
  assert.equal((await actions.storyLink({ chat: '7', id: -1 })).ok, false);
  assert.equal(log.length, 1);
  const none = make(() => ({}));
  assert.equal((await none.actions.storyLink({ chat: '7', id: 3 })).ok, false);
});

test('a story tells whether it is pinned and whom it is for', () => {
  const item = (extra) => ({
    className: 'StoryItem',
    id: 3,
    date: 1,
    media: { className: 'MessageMediaEmpty' },
    ...extra,
  });
  assert.equal(shapeStory(item({})).privacy, 'everyone');
  assert.equal(shapeStory(item({ contacts: true })).privacy, 'contacts');
  assert.equal(
    shapeStory(item({ closeFriends: true })).privacy,
    'close-friends'
  );
  assert.equal(
    shapeStory(item({ selectedContacts: true })).privacy,
    'selected'
  );
  assert.equal(shapeStory(item({ pinned: true, public: true })).pinned, true);
  assert.equal(shapeStory(item({ pinned: true, public: true })).public, true);
  assert.equal(shapeStory(item({})).pinned, false);
});

test('the routes validate their bodies', async () => {
  const calls = [];
  const spy = (name) => async (r) => calls.push([name, r]) && { ok: true };
  const account = { storyEdit: spy('edit'), storyLink: spy('link') };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(
    await status('story-edit', { chat: '7', id: 3, caption: 'a' }),
    200
  );
  assert.equal(
    await status('story-edit', { chat: '7', id: 3, privacy: 'contacts' }),
    200
  );
  assert.equal(await status('story-edit', { chat: '7', id: 3 }), 400);
  assert.equal(
    await status('story-edit', { chat: '7', id: '3', caption: 'a' }),
    400
  );
  assert.equal(
    await status('story-edit', { chat: '7', id: 3, privacy: 'selected' }),
    400
  );
  assert.equal(await status('story-link', { chat: '-100', id: 3 }), 200);
  assert.equal(await status('story-link', { chat: 'a', id: 3 }), 400);
  assert.equal(await status('story-link', { chat: '7' }), 400);
  assert.deepEqual(calls[0], ['edit', { chat: '7', id: 3, caption: 'a' }]);
  assert.equal(calls.length, 3);
});

test('the menu offers what the story allows', () => {
  assert.deepEqual(manageKeys(null, true), []);
  assert.deepEqual(manageKeys({ id: 1, pinned: false }, true), [
    'story-edit-caption',
    'story-edit-privacy',
    'story-pin',
    'story-link',
    'story-delete-menu',
  ]);
  assert.ok(manageKeys({ id: 1, pinned: true }, true).includes('story-unpin'));
  assert.deepEqual(manageKeys({ id: 1, public: true }, false), ['story-link']);
  assert.deepEqual(manageKeys({ id: 1 }, false), []);
  for (const key of manageKeys({ id: 1 }, true).concat('story-unpin')) {
    assert.match(manageLabel(key), /^chat\.storyManage\./);
  }
});

test('edit requests, problems and the story after an edit', () => {
  assert.deepEqual(
    editBody({
      chat: '7',
      id: 3,
      mode: 'caption',
      caption: ' hi ',
      privacy: 'contacts',
      users: new Set(),
    }),
    { chat: '7', id: 3, caption: 'hi' }
  );
  assert.deepEqual(
    editBody({
      chat: '7',
      id: 3,
      mode: 'privacy',
      caption: 'x',
      privacy: 'selected',
      users: new Set(['5']),
    }),
    { chat: '7', id: 3, privacy: 'selected', users: ['5'] }
  );
  assert.deepEqual(
    editBody({
      chat: '7',
      id: 3,
      mode: 'privacy',
      caption: 'x',
      privacy: 'contacts',
      users: new Set(['5']),
    }),
    { chat: '7', id: 3, privacy: 'contacts' }
  );
  assert.equal(
    editProblem({ mode: 'privacy', privacy: 'selected', users: new Set() }),
    'users-invalid'
  );
  assert.equal(
    editProblem({ mode: 'caption', privacy: 'selected', users: new Set() }),
    null
  );
  const story = { id: 3, caption: 'old', entities: [{}], privacy: 'everyone' };
  assert.deepEqual(editedStory(story, { ok: true, caption: 'new' }), {
    id: 3,
    caption: 'new',
    entities: [],
    privacy: 'everyone',
  });
  assert.equal(
    editedStory(story, { ok: true, privacy: 'contacts' }).privacy,
    'contacts'
  );
  assert.equal(manageError('gone'), 'chat.storyManage.err.gone');
  assert.equal(manageError('weird'), 'chat.storyManage.err.failed');
});
