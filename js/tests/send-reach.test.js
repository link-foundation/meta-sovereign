import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUserConnection } from '../src/sources/telegram-account.js';
import { AVATAR_SLOTS, takeSlot } from '../src/web/peer-avatar.js';
import { telegramChatUrl } from '../src/web/person-panel.js';
import { noticeInWords } from '../src/web/chat-view.js';

const unknown = () =>
  new Error('Could not find the input entity for {"userId":"77"}');

test('an old chat is found by listing every dialog and its stored peer (R-Y85)', async () => {
  const stored = new Map();
  let lookups = 0;
  let clock = 0;
  const connection = createUserConnection({
    clientFactory: async () => ({}),
    peers: { input: async (chat) => stored.get(chat) ?? null },
    now: () => clock,
    lookup: async () => {
      lookups += 1;
      stored.set('77', 'peer:77');
    },
  });
  const used = [];
  const send = (peer) => {
    used.push(peer);
    if (peer === '77') {
      throw unknown();
    }
    return 'sent';
  };
  assert.equal(await connection.withPeer({}, '77', send), 'sent');
  assert.deepEqual(used, ['77', 'peer:77']);
  assert.equal(lookups, 1);
  // Stored now: the next send needs no lookup.
  assert.equal(await connection.withPeer({}, '77', send), 'sent');
  assert.equal(lookups, 1);
  // A chat no dialog has: one lookup, then the error, not a lookup a send.
  clock = 1;
  await assert.rejects(
    connection.withPeer({}, '88', () => {
      throw unknown();
    }),
    /input entity/
  );
  assert.equal(lookups, 1, 'within ten minutes of the last lookup');
});

test('photos take at most a few of the browser connections at a time', () => {
  const started = [];
  const releases = Array.from({ length: AVATAR_SLOTS + 2 }, (_, i) =>
    takeSlot(() => started.push(i))
  );
  assert.deepEqual(started, [0, 1].slice(0, AVATAR_SLOTS));
  // One waiting gives up (scrolled away): it never starts.
  releases[AVATAR_SLOTS]();
  releases[0]();
  assert.deepEqual(started.at(-1), AVATAR_SLOTS + 1);
  releases[0]();
  for (const release of releases) {
    release();
  }
  const again = [];
  const free = Array.from({ length: AVATAR_SLOTS }, (_, i) =>
    takeSlot(() => again.push(i))
  );
  assert.equal(again.length, AVATAR_SLOTS, 'every slot was given back');
  free.forEach((release) => release());
});

test('the About panel opens the chat in Telegram', () => {
  const url = (chat, extra = {}) =>
    telegramChatUrl({ source: 'telegram', chat, ...extra });
  assert.equal(url('77'), 'https://web.telegram.org/a/#77');
  assert.equal(url('77', { username: 'someone' }), 'https://t.me/someone');
  assert.equal(url('-1001234', { lastId: '56' }), 'https://t.me/c/1234/56');
  assert.equal(url('-1001234'), 'https://web.telegram.org/a/#-1001234');
  assert.equal(
    url('77', { phone: '+1 (234) 567-8901' }),
    'https://t.me/+12345678901'
  );
  assert.equal(
    url('77', { username: '@someone', text: 'hello world' }),
    'https://t.me/someone?text=hello%20world'
  );
  assert.equal(
    url('77', { username: 'javascript:evil', phone: 'bad' }),
    'https://web.telegram.org/a/#77'
  );
  assert.equal(url('77&evil=true'), null);
  assert.equal(url('-42'), 'https://web.telegram.org/a/#-42');
  assert.equal(telegramChatUrl({ source: 'vk', chat: '1' }), null);
  assert.equal(
    url('77', { username: 'someone', native: true }),
    'tg://resolve?domain=someone'
  );
  assert.equal(
    url('77', { phone: '+12345678901', native: true, text: 'hello world' }),
    'tg://resolve?phone=12345678901&text=hello%20world'
  );
  assert.equal(
    url('-1001234', { lastId: 56, native: true }),
    'tg://privatepost?channel=1234&post=56'
  );
  assert.equal(
    url('77', { native: true }),
    'https://web.telegram.org/a/#77',
    'do not invent unsupported numeric native links'
  );
});

test('a failed draft says why in words', () => {
  const t = (key, values = {}) =>
    key === 'chat.failure.unknownChat'
      ? 'This chat is not available to your account.'
      : `${key}:${JSON.stringify(values)}`;
  assert.equal(
    noticeInWords(t, {
      kind: 'failed',
      code: 'unknown-chat',
      error: 'Could not find the input entity',
    }).error,
    'This chat is not available to your account'
  );
  assert.equal(
    noticeInWords(t, { kind: 'failed', error: 'boom.' }).error,
    'boom'
  );
  const sent = { kind: 'draft-send' };
  assert.equal(noticeInWords(t, sent), sent);
});
