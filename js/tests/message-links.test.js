// Forward options and links to messages (R-Y154): the t.me link parser,
// the flags reaching messages.forwardMessages, channels.exportMessageLink
// and contacts.resolveUsername with fake clients, and the routes'
// validation. Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import { createActions } from '../src/sources/telegram-actions.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { createMessageLinks } from '../src/sources/telegram-message-links.js';
import { channelChat, parseMessageLink } from '../src/web/message-links.js';
import { named, postRoute } from './helpers/telegram-route.js';

const link = (username, id, thread = null) => ({
  username,
  channel: null,
  id,
  thread,
});
const priv = (channel, id, thread = null) => ({
  username: null,
  channel,
  id,
  thread,
});

test('public message links', () => {
  for (const [href, expected] of [
    ['https://t.me/durov/123', link('durov', 123)],
    ['http://t.me/durov/123', link('durov', 123)],
    ['https://www.t.me/durov/123', link('durov', 123)],
    ['https://telegram.me/durov/5/', link('durov', 5)],
    ['https://telegram.dog/durov/5', link('durov', 5)],
    ['https://T.ME/Durov/9', link('Durov', 9)],
    ['https://t.me/durov/123?single', link('durov', 123)],
    ['https://t.me/durov/123?comment=4', link('durov', 123)],
    ['https://t.me/durov/123#x', link('durov', 123)],
    ['  https://t.me/durov/123  ', link('durov', 123)],
    ['https://t.me/durov/123?thread=77', link('durov', 123, 77)],
    ['https://t.me/durov/10/123', link('durov', 123, 10)],
    ['https://t.me/some_chat_1/2147483647', link('some_chat_1', 2_147_483_647)],
  ]) {
    assert.deepEqual(parseMessageLink(href), expected, href);
  }
});

test('private message links', () => {
  for (const [href, expected] of [
    ['https://t.me/c/1234567/89', priv('1234567', 89)],
    ['https://t.me/c/1234567/89/', priv('1234567', 89)],
    ['https://t.me/c/1234567/89?thread=5', priv('1234567', 89, 5)],
    ['https://t.me/c/1234567/5/89', priv('1234567', 89, 5)],
    ['https://telegram.me/c/1/2', priv('1', 2)],
  ]) {
    assert.deepEqual(parseMessageLink(href), expected, href);
  }
  assert.equal(channelChat('1234567'), '-1001234567');
});

test('tg:// message links', () => {
  assert.deepEqual(
    parseMessageLink('tg://resolve?domain=durov&post=12'),
    link('durov', 12)
  );
  assert.deepEqual(
    parseMessageLink('tg://resolve?domain=durov&post=12&thread=3'),
    link('durov', 12, 3)
  );
  assert.deepEqual(
    parseMessageLink('tg://privatepost?channel=555&post=7'),
    priv('555', 7)
  );
  assert.equal(parseMessageLink('tg://resolve?domain=durov'), null);
  assert.equal(parseMessageLink('tg://resolve?domain=x&post=1'), null);
  assert.equal(parseMessageLink('tg://join?invite=abcdefgh'), null);
});

test('other links are not message links', () => {
  for (const href of [
    '',
    null,
    undefined,
    'not a url',
    'https://t.me/durov',
    'https://t.me/durov/',
    'https://t.me/durov/abc',
    'https://t.me/durov/0',
    'https://t.me/durov/-4',
    'https://t.me/durov/1.5',
    'https://t.me/durov/2147483648',
    'https://t.me/durov/1/2/3',
    'https://t.me/durov/0/5',
    'https://t.me/c/123',
    'https://t.me/c/abc/5',
    'https://t.me/c/0/5',
    'https://t.me/c/123/0',
    'https://t.me/+AbCdEfGhIjKl',
    'https://t.me/joinchat/AbCdEfGhIjKl',
    'https://t.me/addstickers/pack',
    'https://t.me/s/durov/5',
    'https://t.me/ab/5',
    'https://example.com/durov/5',
    'https://t.me.evil.com/durov/5',
    'https://evil.com/t.me/durov/5',
    'https://user:pw@t.me/durov/5',
    'ftp://t.me/durov/5',
    'javascript:alert(1)',
  ]) {
    assert.equal(parseMessageLink(href), null, String(href));
  }
});

// ---- The server ---------------------------------------------------------

const Api = {
  channels: { ExportMessageLink: named('channels.ExportMessageLink') },
  contacts: { ResolveUsername: named('contacts.ResolveUsername') },
  messages: { ForwardMessages: named('messages.ForwardMessages') },
};
const importer = async () => ({
  Api,
  helpers: { returnBigInt: (v) => v, readBigIntFromBuffer: () => 1n },
});

const links = (answer) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const actions = createMessageLinks(
    {
      importer,
      connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
    },
    { userClient: async () => client }
  );
  return { actions, log };
};

const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

test('exportMessageLink: the channel, the id, `thread` only in a topic', async () => {
  const { actions, log } = links(() => ({ link: 'https://t.me/c/5/9' }));
  assert.deepEqual(await actions.messageLink({ chat: '-1005', id: 9 }), {
    ok: true,
    link: 'https://t.me/c/5/9',
  });
  await actions.messageLink({ chat: '-1005', id: 9, thread: true });
  assert.equal(log[0].className, 'channels.ExportMessageLink');
  assert.deepEqual(log[0].channel, { peer: '-1005' });
  assert.equal(log[0].id, 9);
  assert.equal(log[0].thread, undefined);
  assert.equal(log[1].thread, true);
});

test('exportMessageLink: bad requests never reach Telegram', async () => {
  const { actions, log } = links(() => ({ link: 'x' }));
  for (const request of [
    {},
    { chat: '42', id: 1 },
    { chat: '-5', id: 1 },
    { chat: '-1005', id: 0 },
    { chat: '-1005', id: 1.5 },
    { chat: '-1005', id: 2_147_483_648 },
    { chat: '-1005', id: 1, thread: 'yes' },
  ]) {
    const answer = await actions.messageLink(request);
    assert.equal(answer.ok, false);
    assert.equal(answer.code, 'failed');
  }
  assert.equal(log.length, 0);
});

test('exportMessageLink: Telegram errors become codes', async () => {
  const { actions } = links(() => telegramError('CHANNEL_PRIVATE'));
  assert.deepEqual(await actions.messageLink({ chat: '-1005', id: 1 }), {
    ok: false,
    error: 'CHANNEL_PRIVATE',
    code: 'no-access',
  });
});

test('resolveUsername: a channel gives its marked id', async () => {
  const { actions, log } = links(() => ({
    chats: [
      {
        className: 'Channel',
        id: 777n,
        title: 'News',
        username: 'news_ch',
        broadcast: true,
      },
    ],
    users: [],
  }));
  assert.deepEqual(await actions.resolveLink({ username: 'News_Ch' }), {
    ok: true,
    chat: '-100777',
    name: 'News',
    username: 'News_Ch',
    kind: 'channel',
  });
  assert.equal(log[0].username, 'News_Ch');
});

test('resolveUsername: a person, an unknown and a bad name', async () => {
  const person = links(() => ({ chats: [], users: [{ id: 5n }] }));
  assert.equal(
    (await person.actions.resolveLink({ username: 'someone' })).code,
    'not-chat'
  );
  const unknown = links(() => telegramError('USERNAME_NOT_OCCUPIED'));
  assert.equal(
    (await unknown.actions.resolveLink({ username: 'nobody1' })).code,
    'no-chat'
  );
  for (const username of [
    undefined,
    '',
    'a b',
    '1abc',
    'abc',
    'x'.repeat(40),
  ]) {
    assert.equal((await unknown.actions.resolveLink({ username })).ok, false);
  }
  assert.equal(unknown.log.length, 1);
});

// ---- Forward options ----------------------------------------------------

const forwarding = () => {
  const store = createMemoryStore();
  const sent = [];
  const live = createTelegramLive({ store, toLinks: telegramDialogLinks });
  const client = {
    invoke: async (request) => {
      sent.push(request);
      return { className: 'Updates', users: [], chats: [], updates: [] };
    },
  };
  const actions = createActions(
    {
      store,
      importer,
      live,
      log: () => {},
      queue: { run: (_key, _priority, task) => task() },
      connection: {
        open: async () => ({ client }),
        withPeer: (_client, chat, use) => use(`peer:${chat}`),
      },
      peers: {
        input: async (chat) => `peer:${chat}`,
        dialog: async (chat) => ({ id: chat, isGroup: true }),
      },
      catchUp: { observeResult: () => {} },
      channels: { observe: async () => {} },
    },
    {
      credentials: async () => ({ kind: 'user' }),
      toLinks: telegramDialogLinks,
      writeChanged: async () => 0,
    }
  );
  return { actions, sent };
};

test('forward flags reach messages.forwardMessages, only when set', async () => {
  const { actions, sent } = forwarding();
  await actions.forwardMessages({ fromChat: '-5', ids: [1, 2], toChat: '42' });
  await actions.forwardMessages({
    fromChat: '-5',
    ids: [3],
    toChat: '42',
    dropAuthor: true,
  });
  await actions.forwardMessages({
    fromChat: '-5',
    ids: [4],
    toChat: '42',
    dropAuthor: true,
    dropMediaCaptions: true,
  });
  await actions.forwardMessages({
    fromChat: '-5',
    ids: [5],
    toChat: '42',
    dropAuthor: 'yes',
    dropMediaCaptions: 1,
  });
  assert.equal(sent.length, 4);
  assert.ok(sent.every((r) => r.className === 'messages.ForwardMessages'));
  assert.equal(sent[0].dropAuthor, undefined);
  assert.equal(sent[0].dropMediaCaptions, undefined);
  assert.equal(sent[1].dropAuthor, true);
  assert.equal(sent[1].dropMediaCaptions, undefined);
  assert.equal(sent[2].dropAuthor, true);
  assert.equal(sent[2].dropMediaCaptions, true);
  assert.equal(sent[3].dropAuthor, undefined);
  assert.equal(sent[3].dropMediaCaptions, undefined);
  assert.deepEqual(sent[0].id, [1, 2]);
});

// ---- Routes -------------------------------------------------------------

test('the routes validate strictly', async () => {
  const calls = [];
  const account = {
    forwardMessages: async (body) => (
      calls.push(['forward', body]),
      { ok: true }
    ),
    messageLink: async (body) => (calls.push(['link', body]), { ok: true }),
    resolveLink: async (body) => (calls.push(['resolve', body]), { ok: true }),
  };
  const base = { fromChat: '-5', toChat: '42', ids: [1] };
  for (const [route, bad, good] of [
    ['forward', { ...base, dropAuthor: 'yes' }, { ...base, dropAuthor: true }],
    [
      'forward',
      { ...base, dropMediaCaptions: 1 },
      { ...base, dropMediaCaptions: false },
    ],
    ['message-link', { chat: '-5', id: 1 }, { chat: '-1005', id: 1 }],
    [
      'message-link',
      { chat: '-1005', id: '1' },
      { chat: '-1005', id: 2, thread: true },
    ],
    [
      'message-link',
      { chat: '-1005', id: 1, thread: 1 },
      { chat: '-1005', id: 3 },
    ],
    [
      'message-link',
      { chat: '-1005', id: 0 },
      { chat: '-1005', id: 2_147_483_647 },
    ],
    ['resolve-link', { username: 'a' }, { username: 'durov' }],
    ['resolve-link', {}, { username: 'Some_chat' }],
    ['resolve-link', { username: 5 }, { username: 'abcd' }],
  ]) {
    assert.equal(await postRoute(route, bad, account), 400, route);
    assert.equal(await postRoute(route, good, account), 200, route);
  }
  assert.deepEqual(calls[0][1].dropAuthor, true);
  assert.equal(calls[0][1].dropMediaCaptions, false);
  assert.deepEqual(calls.find(([name]) => name === 'link')[1], {
    chat: '-1005',
    id: 1,
    thread: false,
  });
});

// ---- The forward bar's pure parts ---------------------------------------

test('the forward bar: senders, captions, the staged forward', async () => {
  const { hasCaption, senderNames, stageForward } =
    await import('../src/web/chat-forward.js');
  const file = (body) => ({
    body,
    raw: {
      media: {
        className: 'MessageMediaDocument',
        document: {
          id: '9',
          mimeType: 'application/pdf',
          size: 10,
          attributes: [
            { className: 'DocumentAttributeFilename', fileName: 'a.pdf' },
          ],
        },
      },
    },
  });
  assert.equal(hasCaption(file('words')), true);
  assert.equal(hasCaption(file('')), false);
  assert.equal(hasCaption({ body: 'plain', raw: {} }), false);
  assert.deepEqual(
    senderNames(
      [
        { sender: 'me' },
        { sender: 'a', senderName: 'Alice' },
        { sender: 'a', senderName: 'Alice' },
        { sender: 'b', senderName: 'Bob' },
        { sender: 'c' },
      ],
      'You'
    ),
    ['You', 'Alice', 'Bob']
  );
  const staged = stageForward({
    messages: [{ id: 'x' }],
    fromChat: -5,
    to: { key: 'telegram:42', chat: '42', name: 'Ann' },
  });
  assert.equal(staged.fromChat, '-5');
  assert.equal(staged.toKey, 'telegram:42');
  assert.equal(staged.dropAuthor, false);
  assert.equal(staged.dropMediaCaptions, false);
});
