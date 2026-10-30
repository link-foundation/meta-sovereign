import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChatSummarizer,
  searchChats,
  summarizeChats,
} from '../src/web/chat-model.js';
import {
  chatListEntries,
  listOffsets,
  listRange,
} from '../src/web/chat-list-window.js';
import { pendingChatPreviews } from '../src/web/chat-pending-preview.js';
import { chatsInFolder } from '../src/web/chat-folders.js';

const message = (chat, body = 'Hello', id = 1) => ({
  id: `msg:telegram:${chat}:${id}`,
  source: 'telegram',
  chat,
  sender: 'me',
  body,
  timestamp: '2026-10-31T00:00:00Z',
  chatType: 'personal_chat',
});
const read = (chat, fields = {}) => ({
  id: `read:telegram:${chat}`,
  source: 'telegram',
  chat,
  ...fields,
});

test('directory person lookups are linear in the supplied records', () => {
  let lookups = 0;
  const links = Array.from({ length: 40 }, (_, chat) => [
    message(String(chat)),
    { id: `person:telegram:${chat}`, name: `Contact ${chat}` },
  ])
    .flat()
    .map((link) => ({
      ...link,
      get id() {
        lookups++;
        return link.id;
      },
    }));
  const rows = summarizeChats(links);
  assert.equal(rows.length, 40);
  assert.equal(rows[20].name, 'Contact 20');
  assert.ok(
    lookups < links.length * 8,
    `record visits stay bounded: ${lookups}`
  );
});

test('unrelated events keep summaries and searches stable; only affected chats change', () => {
  const summarize = createChatSummarizer();
  const links = [message('1'), message('2'), read('1'), read('2')];
  const before = summarize(links);
  const withTyping = [
    ...links,
    { id: 'typing:telegram:1', source: 'telegram', chat: '1' },
  ];
  assert.equal(summarize(withTyping), before);
  const edited = [
    ...withTyping.slice(0, 3),
    read('2', { unreadCount: 4 }),
    withTyping[4],
  ];
  const after = summarize(edited);
  assert.equal(
    after.find((c) => c.chat === '1'),
    before.find((c) => c.chat === '1')
  );
  assert.notEqual(
    after.find((c) => c.chat === '2'),
    before.find((c) => c.chat === '2')
  );
  assert.equal(after.find((c) => c.chat === '2').unread, 4);
  assert.equal(searchChats(after, 'Hello')[0], after[0]);
  const named = summarize([
    ...edited,
    { id: 'person:telegram:1', name: 'Alice' },
  ]);
  assert.equal(named.find((c) => c.chat === '1').name, 'Alice');
  assert.equal(
    named.find((c) => c.chat === '2'),
    after.find((c) => c.chat === '2')
  );
  assert.equal(summarize([links[0]]).length, 1, 'removed chats are released');
});

test('summary reuse respects mute expiry and a changed owner', () => {
  const summarize = createChatSummarizer();
  const links = [message('1'), read('1', { muteUntil: 10 })];
  assert.equal(summarize(links, { now: 0 })[0].muted, true);
  assert.equal(summarize(links, { now: 11_000 })[0].muted, false);
  assert.equal(
    summarize(links, { self: ['someone-else'] })[0].last.mine,
    false
  );
});

test('folder filtering preserves unchanged rows while respecting folder pin ranks', () => {
  const chats = summarizeChats([message('1'), message('2')]);
  const folder = { nonContacts: true, pinned: ['1'] };
  const filtered = chatsInFolder(chats, folder);
  assert.equal(
    filtered.find((chat) => chat.chat === '2'),
    chats.find((chat) => chat.chat === '2')
  );
  assert.equal(filtered.find((chat) => chat.chat === '1').pinned, 1);
  assert.equal(chats.find((chat) => chat.chat === '1').pinned, 0);
});

test('viewport offsets cover all rows while only a nearby slice is rendered', () => {
  const chats = summarizeChats(
    Array.from({ length: 40 }, (_, i) => message(String(i)))
  );
  const entries = chatListEntries(chats, 'oldest');
  assert.ok(entries[0].group);
  const offsets = listOffsets(entries, { chat: 60, heading: 30 });
  assert.equal(offsets.at(-1), 2430);
  assert.deepEqual(listRange(offsets, 1200, 300), { start: 15, end: 31 });
  assert.deepEqual(listRange(offsets, 4000, 300), { start: 41, end: 41 });
});

test('local sends immediately update previews without changing confirmed chat data', () => {
  const chats = summarizeChats([message('1'), message('2')]);
  const pending = [
    {
      key: 'telegram:2',
      source: 'telegram',
      chat: '2',
      clientId: 'send-1',
      text: 'On its way',
      at: '2026-10-31T00:01:00Z',
      status: 'sending',
    },
  ];
  const shown = pendingChatPreviews(chats, pending);
  assert.equal(shown[0].key, 'telegram:2');
  assert.equal(shown[0].last.body, 'On its way');
  assert.equal(shown[0].pendingStatus, 'sending');
  assert.equal(chats.find((c) => c.chat === '2').last.body, 'Hello');
  assert.equal(
    shown.find((c) => c.chat === '1'),
    chats.find((c) => c.chat === '1')
  );
  assert.equal(
    pendingChatPreviews(chats, [{ ...pending[0], scheduleDate: 1 }]),
    chats
  );
  const sent = [{ ...message('2', 'On its way', 2), clientId: 'send-1' }];
  const confirmed = summarizeChats(sent);
  assert.equal(
    pendingChatPreviews(confirmed, pending),
    confirmed,
    'echo wins over its pending preview'
  );
});
