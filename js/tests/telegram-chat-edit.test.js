// New groups and channels, and a chat's info edited (R-Y129): contacts
// listed, a group and a channel created and remembered, a title, a
// description and a photo changed, Telegram's errors as codes, the info
// reader's canEdit and the routes. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createChatEdit } from '../src/sources/telegram-chat-edit.js';
import { canEditIn } from '../src/sources/telegram-chat-info.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  InputUser: named('InputUser'),
  InputChatUploadedPhoto: named('InputChatUploadedPhoto'),
  InputChatPhotoEmpty: named('InputChatPhotoEmpty'),
  contacts: { GetContacts: named('GetContacts') },
  messages: {
    CreateChat: named('CreateChat'),
    EditChatTitle: named('EditChatTitle'),
    EditChatAbout: named('EditChatAbout'),
    EditChatPhoto: named('EditChatPhoto'),
  },
  channels: {
    CreateChannel: named('CreateChannel'),
    EditTitle: named('EditTitle'),
    EditPhoto: named('EditPhoto'),
  },
};

class CustomFile {
  constructor(name, size, path) {
    Object.assign(this, { name, size, path });
  }
}

const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

const make = (answer) => {
  const log = [];
  const applied = [];
  const remembered = [];
  const dropped = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    uploadFile: async ({ file }) => ({ className: 'InputFile', file }),
  };
  const actions = createChatEdit(
    {
      importer: async () => ({
        Api,
        CustomFile,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
      peers: { remember: async (...args) => remembered.push(args) },
    },
    {
      userClient: async () => client,
      apply: async (_c, result) => applied.push(result),
      uploads: {
        uploadOf: (token) =>
          token === 'tok' ? { path: '/x/data', name: 'a.png', size: 9 } : null,
        dropUpload: async (token) => dropped.push(token),
      },
    }
  );
  return { actions, log, applied, remembered, dropped };
};

const contactsAnswer = {
  users: [
    { id: 5n, accessHash: 55n, firstName: 'Bo', lastName: 'Z' },
    { id: 4n, accessHash: 44n, firstName: 'Al', username: 'al' },
    { id: 9n, self: true, firstName: 'Me' },
  ],
};

test('contacts are listed by name, without oneself', async () => {
  const { actions } = make(() => contactsAnswer);
  const answer = await actions.chatContacts();
  assert.deepEqual(answer.contacts, [
    { id: '4', name: 'Al', username: 'al' },
    { id: '5', name: 'Bo Z', username: null },
  ]);
});

test('a group is created from contacts, applied and remembered', async () => {
  const { actions, log, applied, remembered } = make((r) =>
    r.className === 'GetContacts'
      ? contactsAnswer
      : { updates: { chats: [{ className: 'Chat', id: 77n }] } }
  );
  const answer = await actions.createGroup({
    title: ' Team ',
    users: ['4', '5'],
  });
  assert.deepEqual(answer, { ok: true, chat: '-77', title: 'Team' });
  const made = log.find((r) => r.className === 'CreateChat');
  assert.equal(made.title, 'Team');
  assert.deepEqual(
    made.users.map((u) => [u.userId, u.accessHash]),
    [
      [4n, 44n],
      [5n, 55n],
    ]
  );
  assert.equal(applied.length, 1);
  assert.equal(remembered[0][0], '-77');
  assert.equal(remembered[0][2].isGroup, true);
});

test('a group needs a name and people; unknown people are refused', async () => {
  const { actions, log } = make(() => contactsAnswer);
  assert.equal(
    (await actions.createGroup({ title: ' ', users: ['4'] })).code,
    'title-empty'
  );
  assert.equal(
    (await actions.createGroup({ title: 'x', users: [] })).code,
    'users-too-few'
  );
  assert.equal(
    (await actions.createGroup({ title: 'x', users: ['123'] })).code,
    'users-unknown'
  );
  assert.ok(!log.some((r) => r.className === 'CreateChat'));
});

test('a channel is created, its address is -100…', async () => {
  const { actions, log, remembered } = make(() => ({
    chats: [{ className: 'Channel', id: 8n }],
  }));
  const answer = await actions.createChannel({ title: 'News', about: 'Hi' });
  assert.deepEqual(answer, { ok: true, chat: '-1008', title: 'News' });
  const made = log[0];
  assert.equal(made.broadcast, true);
  assert.equal(made.about, 'Hi');
  assert.equal(remembered[0][2].isChannel, true);
  assert.equal(
    (await actions.createChannel({ title: '' })).code,
    'title-empty'
  );
  assert.equal(
    (await actions.createChannel({ title: 'x', about: 'a'.repeat(256) })).code,
    'about-too-long'
  );
});

test('Telegram errors become codes', async () => {
  const code = async (error) => {
    const { actions } = make(() => telegramError(error));
    return (await actions.createChannel({ title: 'x' })).code;
  };
  assert.equal(await code('CHANNELS_TOO_MUCH'), 'too-many-chats');
  assert.equal(await code('CHAT_ADMIN_REQUIRED'), 'not-admin');
  assert.equal(await code('CHAT_TITLE_EMPTY'), 'title-empty');
  assert.equal(await code('SOMETHING_ELSE'), 'failed');
  const { actions } = make((r) =>
    r.className === 'GetContacts'
      ? contactsAnswer
      : telegramError('USERS_TOO_FEW')
  );
  assert.equal(
    (await actions.createGroup({ title: 'x', users: ['4'] })).code,
    'users-too-few'
  );
});

test('a channel is edited: title, about and photo', async () => {
  const { actions, log, applied, dropped } = make(() => ({
    className: 'Updates',
  }));
  const answer = await actions.editChatInfo({
    chat: '-1008',
    title: 'New',
    about: 'Text',
    photo: 'tok',
  });
  assert.equal(answer.ok, true);
  assert.deepEqual(
    log.map((r) => r.className),
    ['EditTitle', 'EditChatAbout', 'EditPhoto']
  );
  assert.equal(log[0].title, 'New');
  assert.equal(log[1].about, 'Text');
  assert.equal(log[2].photo.className, 'InputChatUploadedPhoto');
  assert.equal(log[2].photo.file.file.path, '/x/data');
  assert.equal(applied.length, 3);
  assert.deepEqual(dropped, ['tok']);
});

test('a group is edited with its chat id; the photo removed', async () => {
  const { actions, log } = make(() => ({ className: 'Updates' }));
  await actions.editChatInfo({ chat: '-77', title: 'T', photo: 'remove' });
  assert.deepEqual(
    log.map((r) => r.className),
    ['EditChatTitle', 'EditChatPhoto']
  );
  assert.equal(log[0].chatId, 77n);
  assert.equal(log[1].photo.className, 'InputChatPhotoEmpty');
});

test('an edit that changes nothing is no failure; bad ones are refused', async () => {
  const { actions } = make(() => telegramError('CHAT_NOT_MODIFIED'));
  assert.equal(
    (await actions.editChatInfo({ chat: '-5', title: 'Same' })).ok,
    true
  );
  assert.equal(
    (await actions.editChatInfo({ chat: '5', title: 'x' })).ok,
    false
  );
  assert.equal(
    (await actions.editChatInfo({ chat: '-5', title: '  ' })).code,
    'title-empty'
  );
  assert.equal(
    (await actions.editChatInfo({ chat: '-5', photo: 'nope' })).code,
    'photo-invalid'
  );
  const denied = make(() => telegramError('CHAT_ADMIN_REQUIRED'));
  assert.equal(
    (await denied.actions.editChatInfo({ chat: '-5', title: 'x' })).code,
    'not-admin'
  );
});

test('who may edit: the creator, or an admin with changeInfo', () => {
  assert.equal(canEditIn({ creator: true }), true);
  assert.equal(canEditIn({ adminRights: { changeInfo: true } }), true);
  assert.equal(canEditIn({ adminRights: { pinMessages: true } }), false);
  assert.equal(canEditIn({}), false);
  // A group whose members may change its info; a channel never.
  const open = { defaultBannedRights: { changeInfo: false } };
  assert.equal(canEditIn(open), true);
  assert.equal(canEditIn({ ...open, broadcast: true }), false);
  assert.equal(canEditIn({ ...open, left: true }), false);
  assert.equal(
    canEditIn({ ...open, bannedRights: { changeInfo: true } }),
    false
  );
  assert.equal(canEditIn({ defaultBannedRights: { changeInfo: true } }), false);
});

const post = async (route, body, account) => {
  const path = `/api/telegram/${route}`;
  const req = Object.assign(
    Readable.from([Buffer.from(JSON.stringify(body))]),
    {
      method: 'POST',
      url: path,
      headers: { 'content-type': 'application/json', host: '127.0.0.1:8787' },
    }
  );
  const answered = {};
  const res = {
    setHeader() {},
    writeHead(code) {
      answered.status = code;
    },
    end() {},
  };
  const ctx = { telegramAccount: account, allowOrigins: [] };
  await handleTelegramRoutes(req, res, path, ctx);
  return answered;
};

test('the routes validate and pass on', async () => {
  const seen = [];
  const account = {
    chatContacts: async () => ({ ok: true, contacts: [] }),
    createGroup: async (r) => (seen.push(r), { ok: true }),
    createChannel: async (r) => (seen.push(r), { ok: true }),
    editChatInfo: async (r) => (seen.push(r), { ok: true }),
  };
  assert.equal((await post('chat-contacts', {}, account)).status, 200);
  assert.equal(
    (await post('group-create', { title: 'a', users: [4] }, account)).status,
    200
  );
  assert.equal(
    (await post('group-create', { title: 'a', users: ['x'] }, account)).status,
    400
  );
  assert.equal(
    (await post('group-create', { users: [4] }, account)).status,
    400
  );
  assert.equal(
    (await post('channel-create', { title: 'a' }, account)).status,
    200
  );
  assert.equal(
    (await post('channel-create', { title: 1 }, account)).status,
    400
  );
  assert.equal(
    (await post('chat-edit', { chat: '-5', title: 'a' }, account)).status,
    200
  );
  assert.equal((await post('chat-edit', { chat: '-5' }, account)).status, 400);
  assert.equal(
    (await post('chat-edit', { chat: '5', title: 'a' }, account)).status,
    400
  );
  assert.equal(
    (await post('chat-edit', { chat: '-5', photo: 3 }, account)).status,
    400
  );
  assert.deepEqual(seen[0], { title: 'a', users: ['4'] });
});
