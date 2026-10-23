// Communities among a Telegram answer's chats (R-Y222): layer 232 lists
// `community` / `communityForbidden` there, and GramJS cannot place them
// ("Cannot cast Community to any kind of int"). They are dropped as an
// answer is read. The real GramJS classes run in a child process, offline;
// the repair's failure log is checked with fakes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runModuleScript } from './helpers/run-module-script.js';

import {
  chatListClasses,
  withoutCommunities,
} from '../src/sources/telegram-layer.js';
import { rereadUnsupported } from '../src/sources/telegram-repair.js';
import { createMemoryStore } from '../src/storage/universal.js';

const LAYER_MODULE = new URL(
  '../src/sources/telegram-layer.js',
  import.meta.url
).href;

// Serialise each answer with a channel and a community among its chats,
// read it back as GramJS reads a reply, and list the chats' classes.
const classesRead = () => {
  const script = `
    const m = await import(${JSON.stringify(LAYER_MODULE)});
    const { Api } = await m.importTelegram();
    const { createRequire } = await import('node:module');
    const require = createRequire(${JSON.stringify(LAYER_MODULE)});
    const { BinaryReader } = require('telegram/extensions');
    const base = { id: 1n, title: 't', photo: new Api.ChatPhotoEmpty(), date: 1 };
    const chats = () => [
      new Api.Channel({ ...base, megagroup: true }),
      new Api.Community({ ...base }),
      new Api.CommunityForbidden({ id: 2n, title: 'f' }),
    ];
    const answers = {
      dialogs: new Api.messages.DialogsSlice({
        dialogs: [], messages: [], chats: chats(), users: [], count: 0,
      }),
      channelMessages: new Api.messages.ChannelMessages({
        pts: 1, count: 0, messages: [], topics: [], chats: chats(), users: [],
      }),
      difference: new Api.updates.Difference({
        newMessages: [], newEncryptedMessages: [], otherUpdates: [],
        chats: chats(), users: [],
        state: new Api.updates.State({ pts: 1, qts: 0, date: 1, seq: 1, unreadCount: 0 }),
      }),
    };
    const out = {};
    for (const [name, answer] of Object.entries(answers)) {
      const read = new BinaryReader(Buffer.from(answer.getBytes())).tgReadObject();
      out[name] = read.chats.map((c) => c.className);
    }
    console.log(JSON.stringify(out));`;
  const out = runModuleScript(script);
  return JSON.parse(out.trim().split('\n').pop());
};

test('a dialog list, a message page and a difference lose their communities', () => {
  const got = classesRead();
  assert.deepEqual(got.dialogs, ['Channel']);
  assert.deepEqual(got.channelMessages, ['Channel']);
  assert.deepEqual(got.difference, ['Channel']);
});

test('the answers to wrap are found in the schema text', () => {
  const tl = [
    'messages.dialogsSlice#71e094f3 count:int chats:Vector<Chat> users:Vector<User> = messages.Dialogs;',
    'updates#74ae4240 updates:Vector<Update> chats:Vector<Chat> = Updates;',
    'user#1 id:long = User;',
    '---functions---',
    'contacts.get#2 chats:Vector<Chat> = X;',
  ].join('\n');
  assert.deepEqual(chatListClasses(tl), [
    ['messages', 'dialogsSlice'],
    ['updates'],
  ]);
  assert.deepEqual(
    withoutCommunities([{ className: 'Chat' }, { className: 'Community' }]),
    [{ className: 'Chat' }]
  );
  assert.equal(withoutCommunities(undefined), undefined);
});

test('the repair log counts why reads failed, without any chat id', async () => {
  const store = createMemoryStore();
  for (const chat of ['-1001', '-1002', '-1003']) {
    await store.put({
      id: `msg:telegram:${chat}:1`,
      source: 'telegram',
      chat,
      raw: { media: { className: 'MessageMediaUnsupported' } },
    });
  }
  const refresh = async ({ chat }) => {
    if (chat === '-1003') {
      throw new Error('Cannot cast Community to any kind of int 77');
    }
    throw Object.assign(new Error('x'), { errorMessage: 'RPC_CALL_FAIL' });
  };
  const events = [];
  await rereadUnsupported(store, {
    refresh,
    layer: 232,
    log: (e) => events.push(e),
  });
  const [event] = events;
  assert.equal(event.failed, 3);
  assert.deepEqual(event.reasons, {
    RPC_CALL_FAIL: 2,
    'Cannot cast Community to any kind of int': 1,
  });
  assert.ok(!JSON.stringify(event).includes('100'));
});
