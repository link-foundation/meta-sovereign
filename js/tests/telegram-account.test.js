// The connected Telegram account: a stored session is synced into chats
// and contacts, and the composer sends through it. A fake GramJS client
// stands in for Telegram — nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import {
  createTelegramAccount,
  readTelegramCredentials,
  telegramDialogLinks,
  TELEGRAM_SYNC_ID,
} from '../src/sources/telegram-account.js';

const ME = { id: 1, username: 'owner', firstName: 'Own', self: true };
const ALICE = {
  id: 42,
  firstName: 'Alice',
  lastName: 'Liddell',
  username: 'alice',
};
const BOB = { id: 77, firstName: 'Bob' };

const seed = async (store, extra = {}) => {
  const put = (name, value) =>
    store.put({ id: `secret:telegram:${name}`, tokens: [], value });
  await put('user-session', 'fake-session');
  await put('api-id', '123');
  await put('api-hash', 'fake-hash');
  for (const [k, v] of Object.entries(extra)) {
    await put(k, v);
  }
};

const fakeClient = () => {
  const chats = {
    42: [
      {
        id: 2,
        message: 'how are you?',
        date: 1700000100,
        senderId: 42,
        sender: ALICE,
        replyTo: { replyToMsgId: 1 },
      },
      { id: 1, message: 'hi Alice', date: 1700000000, out: true, senderId: 1 },
    ],
    '-100': [
      {
        id: 9,
        message: '',
        media: {},
        date: 1700000200,
        senderId: 77,
        sender: BOB,
      },
    ],
  };
  const calls = { getMessages: 0, connect: 0, sent: [], contacts: 0 };
  const dialogs = () => [
    {
      id: 42,
      title: 'Alice Liddell',
      isUser: true,
      entity: ALICE,
      message: { id: chats[42][0].id },
    },
    {
      id: '-100',
      title: 'Team',
      isGroup: true,
      entity: { id: -100, title: 'Team', className: 'Chat' },
      message: { id: chats['-100'][0].id },
    },
  ];
  return {
    calls,
    chats,
    setLogLevel() {},
    async connect() {
      calls.connect += 1;
    },
    async disconnect() {},
    async getMe() {
      return ME;
    },
    async getDialogs() {
      return dialogs();
    },
    async getMessages(entity, { limit }) {
      calls.getMessages += 1;
      const key = String(entity.id ?? entity);
      return (chats[key] ?? []).slice(0, limit);
    },
    async getEntity(peer) {
      return String(peer) === '42' ? { ...ALICE, className: 'User' } : null;
    },
    async getContacts() {
      calls.contacts += 1;
      return [ME, ALICE, BOB];
    },
    async sendMessage(peer, { message }) {
      calls.sent.push({ peer, message });
      return { id: 3 };
    },
  };
};

const accountWith = (store, client, extra = {}) =>
  createTelegramAccount({
    store,
    clientFactory: async () => client,
    botLive: {
      async post() {
        throw new Error('no bot in this test');
      },
      async pullMessages() {
        return { links: [], nextOffset: null };
      },
    },
    pollMs: 0,
    ...extra,
  });

test('a user session wins over a bot token', async () => {
  const store = createMemoryStore();
  assert.equal(await readTelegramCredentials(store), null);
  await store.put({
    id: 'secret:telegram:bot-token',
    tokens: [],
    value: '1:x',
  });
  assert.equal((await readTelegramCredentials(store)).kind, 'bot');
  await seed(store);
  const creds = await readTelegramCredentials(store);
  assert.equal(creds.kind, 'user');
  assert.equal(creds.apiId, '123');
});

test('dialog messages become chat links (mine, replies, media)', () => {
  const [incoming, mine] = telegramDialogLinks(
    { id: 42, title: 'Alice Liddell', isUser: true, entity: ALICE },
    fakeClient().chats[42]
  );
  assert.equal(incoming.id, 'msg:telegram:42:2');
  assert.equal(incoming.sender, '42');
  assert.equal(incoming.chatType, 'personal_chat');
  assert.equal(incoming.senderName, 'Alice Liddell');
  assert.equal(incoming.replyTo, '42:1');
  assert.equal(mine.sender, 'me');
  const [media] = telegramDialogLinks(
    { id: '-100', title: 'Team', isGroup: true },
    fakeClient().chats['-100']
  );
  assert.equal(media.body, '📎');
  assert.equal(media.chatType, 'group');
});

test('sync fills chats and contacts, and says who is connected', async () => {
  const store = createMemoryStore();
  await seed(store);
  const client = fakeClient();
  const events = [];
  const account = accountWith(store, client, { log: (e) => events.push(e) });
  const result = await account.sync({ full: true });
  assert.equal(result.connected, true);
  assert.equal(result.account.username, 'owner');
  assert.equal(result.chats, 2);
  assert.equal(result.contacts, 2);
  assert.equal((await store.get('msg:telegram:42:2')).body, 'how are you?');
  assert.equal((await store.get('msg:telegram:42:1')).sender, 'me');
  const alice = await store.get('person:telegram:42');
  assert.equal(alice.contact, true);
  assert.equal(alice.handle, 'alice');
  assert.equal(await store.get('person:telegram:1'), null, 'not the owner');
  // Logs carry counts only — never the session.
  assert.ok(events.some((e) => e.event === 'telegram_sync'));
  assert.ok(!JSON.stringify(events).includes('fake-session'));
  const status = await account.status();
  assert.equal(status.connected, true);
  assert.equal(status.kind, 'user');
  assert.ok(!JSON.stringify(status).includes('fake-session'));
  assert.ok(
    !JSON.stringify(await store.get(TELEGRAM_SYNC_ID)).includes('fake-session')
  );
});

test('a re-sync reads only chats with new messages', async () => {
  const store = createMemoryStore();
  await seed(store);
  const client = fakeClient();
  const account = accountWith(store, client);
  await account.sync({ full: true });
  const before = client.calls.getMessages;
  const quiet = await account.sync();
  assert.equal(client.calls.getMessages, before, 'nothing new, nothing read');
  assert.equal(quiet.written, 0);
  assert.equal(client.calls.connect, 1, 'the connection is reused');
  client.chats[42].unshift({
    id: 4,
    message: 'ping',
    date: 1700000300,
    senderId: 42,
    sender: ALICE,
  });
  const busy = await account.sync();
  assert.equal(client.calls.getMessages, before + 1);
  assert.equal(busy.written, 1);
  assert.equal((await store.get('msg:telegram:42:4')).body, 'ping');
});

test('a session without api_id/api_hash reports what is missing', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'secret:telegram:user-session',
    tokens: [],
    value: 's',
  });
  const account = accountWith(store, fakeClient());
  const result = await account.sync();
  assert.equal(result.connected, true);
  assert.equal(result.code, 'needs-api-credentials');
});

test('post sends as the user and returns the canonical link', async () => {
  const store = createMemoryStore();
  await seed(store);
  const client = fakeClient();
  const account = accountWith(store, client);
  const result = await account.post({ chat: '42', text: 'hello there' });
  assert.deepEqual(client.calls.sent, [{ peer: '42', message: 'hello there' }]);
  assert.equal(result.link.id, 'msg:telegram:42:3');
  assert.equal(result.link.sender, 'me');
});

test('history pulls one chat on demand', async () => {
  const store = createMemoryStore();
  await seed(store);
  const account = accountWith(store, fakeClient());
  const { written } = await account.history({ chat: '42' });
  assert.equal(written, 2);
  assert.equal(
    (await store.get('msg:telegram:42:2')).chatName,
    'Alice Liddell'
  );
});

test('a bot token is not polled in the background', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'secret:telegram:bot-token',
    tokens: [],
    value: '1:x',
  });
  let pulled = 0;
  const account = createTelegramAccount({
    store,
    clientFactory: async () => assert.fail('no MTProto for a bot'),
    botLive: {
      async pullMessages() {
        pulled += 1;
        return { links: [], nextOffset: null };
      },
    },
    pollMs: 0,
  });
  const status = await account.connected();
  assert.equal(status.kind, 'bot');
  assert.equal(pulled, 0);
  await account.sync();
  assert.equal(pulled, 1, 'a bot syncs when asked');
});

test('the server syncs, reports and sends through the connected account', async () => {
  const { startServer } = await import('../src/server/index.js');
  const store = createMemoryStore();
  await seed(store);
  const client = fakeClient();
  const server = await startServer({
    store,
    enableSync: false,
    enableHandlers: false,
    automations: { scheduler: false },
    telegramAccount: accountWith(store, client),
  });
  const base = `http://127.0.0.1:${server.port}`;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    const synced = await call('POST', '/api/telegram/sync', { full: true });
    assert.equal(synced.status, 200);
    assert.equal(synced.body.account.username, 'owner');
    const status = await call('GET', '/api/telegram/status');
    assert.equal(status.body.connected, true);
    assert.equal(status.body.chats, 2);
    assert.ok(!JSON.stringify(status.body).includes('fake-session'));
    // The composer: preview, confirm, and the canonical link is stored.
    const draft = { source: 'telegram', chat: '42', text: 'from the app' };
    const asked = await call('POST', '/api/send', draft);
    assert.equal(asked.status, 428);
    const sent = await call('POST', '/api/send', {
      ...draft,
      confirmToken: asked.body.confirm.token,
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.link.id, 'msg:telegram:42:3');
    assert.deepEqual(client.calls.sent, [
      { peer: '42', message: 'from the app' },
    ]);
    assert.equal((await store.get('msg:telegram:42:3')).body, 'from the app');
  } finally {
    await server.close();
  }
});

test('without an account the status says not connected', async () => {
  const { startServer } = await import('../src/server/index.js');
  const server = await startServer({
    store: createMemoryStore(),
    enableSync: false,
    enableHandlers: false,
    automations: { scheduler: false },
    telegramAccount: false,
  });
  try {
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/telegram/status`
    );
    assert.equal((await res.json()).connected, false);
  } finally {
    await server.close();
  }
});
