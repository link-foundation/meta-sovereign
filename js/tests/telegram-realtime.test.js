// A chat that behaves like a messenger: Telegram's live updates land in
// the store as they happen, a message is sent exactly once (however often
// Send is pressed or a request repeated), and every message of ours shows
// where it is — sending, sent, read, or failed. Fakes stand in for
// Telegram; nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import { updateEffect, peerChatId } from '../src/sources/telegram-updates.js';
import {
  createTelegramLive,
  readLinkId,
} from '../src/sources/telegram-account-live.js';
import {
  createTelegramAccount,
  telegramDialogLinks,
} from '../src/sources/telegram-account.js';
import {
  randomIdOf,
  sendError,
  sendText,
  splitMessage,
} from '../src/sources/telegram-send.js';
import {
  chatMessages,
  deliveryStatus,
  summarizeChats,
} from '../src/web/chat-model.js';
import { applyLinkEvents } from '../src/web/chat-live.js';
import { isStreamedId } from '../src/server/routes-events.js';

// ---- updates → effects -----------------------------------------------------

test('raw updates become plain effects with marked chat ids', () => {
  assert.equal(peerChatId({ userId: 42 }), '42');
  assert.equal(peerChatId({ chatId: 5 }), '-5');
  assert.equal(peerChatId({ channelId: 9 }), '-1009');
  const message = { id: 7, message: 'hi', peerId: { userId: 42 }, date: 1 };
  assert.deepEqual(updateEffect({ className: 'UpdateNewMessage', message }), {
    kind: 'message',
    chat: '42',
    message,
    entities: undefined,
  });
  assert.equal(
    updateEffect({
      className: 'UpdateEditChannelMessage',
      message: { ...message, peerId: { channelId: 9 } },
    }).kind,
    'edit'
  );
  // A join/pin is not a chat message.
  assert.equal(
    updateEffect({
      className: 'UpdateNewMessage',
      message: { ...message, className: 'MessageService', action: {} },
    }),
    null
  );
  const short = updateEffect({
    className: 'UpdateShortMessage',
    id: 8,
    userId: 42,
    message: 'yo',
    date: 2,
    out: false,
  });
  assert.equal(short.chat, '42');
  assert.equal(String(short.message.senderId), '42');
  assert.equal(
    updateEffect({
      className: 'UpdateShortChatMessage',
      id: 3,
      chatId: 5,
      fromId: 42,
      message: 'all',
    }).chat,
    '-5'
  );
  assert.deepEqual(
    updateEffect({ className: 'UpdateDeleteMessages', messages: [7, 8] }),
    { kind: 'delete', chat: null, ids: [7, 8] }
  );
  assert.deepEqual(
    updateEffect({
      className: 'UpdateReadHistoryOutbox',
      peer: { userId: 42 },
      maxId: 7,
    }),
    { kind: 'read', chat: '42', maxId: 7 }
  );
  assert.deepEqual(
    updateEffect({
      className: 'UpdateChannelUserTyping',
      channelId: 9,
      fromId: { userId: 42 },
      action: { className: 'SendMessageTypingAction' },
    }),
    { kind: 'typing', chat: '-1009', user: '42', typing: true }
  );
  assert.equal(
    updateEffect({
      className: 'UpdateUserTyping',
      userId: 42,
      action: { className: 'SendMessageCancelAction' },
    }).typing,
    false
  );
  assert.equal(updateEffect({ className: 'UpdateConnectionState' }), null);
});

// ---- live updates → store --------------------------------------------------

const liveWith = (store) => {
  const touched = [];
  const live = createTelegramLive({
    store,
    toLinks: telegramDialogLinks,
    touch: async () => touched.push(1),
  });
  live.chats.set('42', {
    id: '42',
    title: 'Alice',
    isUser: true,
    isGroup: false,
    isChannel: false,
  });
  return { live, touched };
};

test('a live message, its edit, a read receipt and a deletion', async () => {
  const store = createMemoryStore();
  const { live, touched } = liveWith(store);
  const client = {};
  const entities = new Map([['42', { id: 42, firstName: 'Alice' }]]);
  await live.handle(client, {
    className: 'UpdateNewMessage',
    message: {
      id: 10,
      message: 'are you there?',
      peerId: { userId: 42 },
      senderId: 42,
      date: 1_700_000_000,
    },
    _entities: entities,
  });
  const id = 'msg:telegram:42:10';
  const link = await store.get(id);
  assert.equal(link.body, 'are you there?');
  assert.equal(link.chatName, 'Alice');
  assert.equal(link.sender, '42');
  assert.equal(touched.length, 1, 'pollers are told something changed');

  await live.handle(client, {
    className: 'UpdateEditMessage',
    message: {
      id: 10,
      message: 'are you there??',
      peerId: { userId: 42 },
      senderId: 42,
      date: 1_700_000_000,
      editDate: 1_700_000_060,
    },
  });
  assert.equal((await store.get(id)).body, 'are you there??');
  assert.ok((await store.get(id)).edited);

  // Our message 11 out, then the other side reads up to 11.
  await live.handle(client, {
    className: 'UpdateShortMessage',
    id: 11,
    userId: 42,
    out: true,
    message: 'yes',
    date: 1_700_000_100,
  });
  assert.equal((await store.get('msg:telegram:42:11')).sender, 'me');
  await live.handle(client, {
    className: 'UpdateReadHistoryOutbox',
    peer: { userId: 42 },
    maxId: 11,
  });
  assert.equal((await store.get(readLinkId('42'))).outboxMaxId, 11);
  // An older receipt never moves it back.
  await live.handle(client, {
    className: 'UpdateReadHistoryOutbox',
    peer: { userId: 42 },
    maxId: 3,
  });
  assert.equal((await store.get(readLinkId('42'))).outboxMaxId, 11);

  // A private-chat deletion names ids only.
  await live.handle(client, {
    className: 'UpdateDeleteMessages',
    messages: [10],
  });
  assert.equal((await store.get(id)).deleted, true);
  assert.equal((await store.get('msg:telegram:42:11')).deleted, undefined);

  const links = await store.query();
  const key = 'telegram:42';
  const shown = chatMessages(links, key);
  assert.deepEqual(
    shown.map((m) => [m.body, m.delivery ?? null]),
    [['yes', 'read']],
    'the deleted one is gone; ours shows ✓✓'
  );
});

test('typing arrives live and stops on cancel', async () => {
  const store = createMemoryStore();
  const { live } = liveWith(store);
  await live.handle(
    {},
    {
      className: 'UpdateUserTyping',
      userId: 42,
      action: { className: 'SendMessageTypingAction' },
    }
  );
  assert.equal((await store.get('typing:telegram:42:42')).state, 'typing');
  await live.handle(
    {},
    {
      className: 'UpdateUserTyping',
      userId: 42,
      action: { className: 'SendMessageCancelAction' },
    }
  );
  assert.equal((await store.get('typing:telegram:42:42')).state, 'idle');
  // Typing again, then their message arrives: no longer typing.
  await live.handle(
    {},
    {
      className: 'UpdateUserTyping',
      userId: 42,
      action: { className: 'SendMessageTypingAction' },
    }
  );
  await live.handle(
    {},
    {
      className: 'UpdateShortMessage',
      id: 12,
      userId: 42,
      message: 'done',
      date: 1_700_000_000,
    }
  );
  assert.equal((await store.get('typing:telegram:42:42')).state, 'idle');
});

test('the account listens on every client it connects', async () => {
  const store = createMemoryStore();
  const put = (name, value) =>
    store.put({ id: `secret:telegram:${name}`, tokens: [], value });
  await put('user-session', 'fake-session');
  await put('api-id', '1');
  await put('api-hash', 'h');
  const handlers = [];
  const client = {
    setLogLevel() {},
    async connect() {},
    async disconnect() {},
    async getMe() {
      return { id: 1, self: true, firstName: 'Me' };
    },
    async getDialogs() {
      return [];
    },
    async getContacts() {
      return [];
    },
    async getEntity() {
      return { className: 'User', id: 42, firstName: 'Alice' };
    },
    addEventHandler(handler) {
      handlers.push(handler);
    },
  };
  const account = createTelegramAccount({
    store,
    clientFactory: async () => client,
    pollMs: 0,
  });
  await account.sync({ full: true });
  assert.equal(handlers.length, 1);
  await handlers[0]({
    className: 'UpdateNewMessage',
    message: {
      id: 5,
      message: 'live!',
      peerId: { userId: 42 },
      senderId: 42,
      date: 1_700_000_000,
    },
  });
  const link = await store.get('msg:telegram:42:5');
  assert.equal(link.body, 'live!');
  assert.equal(link.chatName, 'Alice', 'named from the entity');
  assert.ok((await store.get('sync:telegram')).changedAt);
});

// ---- sending exactly once --------------------------------------------------

test('long text is split on breaks at 4096 characters', () => {
  assert.deepEqual(splitMessage('short'), ['short']);
  const words = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(' ');
  const parts = splitMessage(words);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 4096));
  assert.equal(parts.join(' '), words, 'nothing lost or added');
  assert.ok(parts.every((p) => !p.startsWith(' ') && !p.endsWith(' ')));
  const solid = 'x'.repeat(5000);
  assert.deepEqual(
    splitMessage(solid).map((p) => p.length),
    [4096, 904]
  );
});

const helpers = {
  readBigIntFromBuffer: (buffer) => buffer.toString('hex'),
};

test('the random_id is stable per draft and part', () => {
  assert.equal(randomIdOf('c1', 0, helpers), randomIdOf('c1', 0, helpers));
  assert.notEqual(randomIdOf('c1', 0, helpers), randomIdOf('c1', 1, helpers));
  assert.notEqual(randomIdOf('c1', 0, helpers), randomIdOf('c2', 0, helpers));
});

test('a repeated random_id counts as already sent', async () => {
  const seen = new Set();
  class SendMessage {
    constructor(args) {
      Object.assign(this, args);
    }
  }
  const Api = { messages: { SendMessage } };
  const client = {
    async getInputEntity(peer) {
      return { peer };
    },
    async invoke(request) {
      if (seen.has(request.randomId)) {
        throw Object.assign(new Error('RANDOM_ID_DUPLICATE'), {
          errorMessage: 'RANDOM_ID_DUPLICATE',
        });
      }
      seen.add(request.randomId);
      assert.equal(request.entities, undefined, 'plain text, no markdown');
      return { className: 'UpdateShortSentMessage', id: seen.size, date: 1 };
    },
  };
  const args = { client, Api, helpers, peer: '42', clientId: 'c1' };
  const first = await sendText({ ...args, text: 'a *b* _c_' });
  assert.deepEqual(first, [{ id: 1, date: 1, text: 'a *b* _c_' }]);
  const again = await sendText({ ...args, text: 'a *b* _c_' });
  assert.equal(again[0].duplicate, true);
  assert.equal(seen.size, 1, 'Telegram got it once');
});

test("Telegram's errors become codes, never a browser retry", () => {
  const flood = sendError(
    Object.assign(new Error('A wait of 30 seconds is required'), {
      errorMessage: 'FLOOD_WAIT',
      seconds: 30,
    })
  );
  assert.equal(flood.code, 'flood-wait');
  assert.equal(flood.retryAfter, 30);
  assert.equal(flood.fallback, false);
  assert.equal(
    sendError({ errorMessage: 'CHAT_WRITE_FORBIDDEN' }).code,
    'write-forbidden'
  );
  assert.equal(
    sendError({ errorMessage: 'PEER_ID_INVALID' }).code,
    'unknown-chat'
  );
  assert.equal(sendError(new Error('socket hang up')).fallback, false);
});

// ---- the server: one send per draft, an event stream -----------------------

const serverWith = async (send, store = createMemoryStore()) => {
  const { startServer } = await import('../src/server/index.js');
  const server = await startServer({
    store,
    enableSync: false,
    enableHandlers: false,
    automations: { scheduler: false, send },
    telegramAccount: false,
  });
  const base = `http://127.0.0.1:${server.port}`;
  const call = async (body) => {
    const res = await fetch(`${base}/api/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const confirmedSend = async (draft) => {
    const asked = await call(draft);
    return call({ ...draft, confirmToken: asked.body.confirm.token });
  };
  return { server, base, store, confirmedSend };
};

test('a draft is sent once, however many requests carry it', async () => {
  let sends = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { server, store, confirmedSend } = await serverWith(async (draft) => {
    sends += 1;
    await gate;
    return {
      via: 'api',
      link: {
        id: `msg:telegram:${draft.chat}:${100 + sends}`,
        source: 'telegram',
        chat: draft.chat,
        sender: 'me',
        body: draft.text,
      },
    };
  });
  try {
    const draft = {
      source: 'telegram',
      chat: '42',
      text: 'once',
      clientId: 'c-1',
    };
    const both = Promise.all([confirmedSend(draft), confirmedSend(draft)]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    const [a, b] = await both;
    assert.equal(sends, 1);
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, b.body);
    assert.equal(a.body.link.clientId, 'c-1');
    assert.equal((await store.get('msg:telegram:42:101')).clientId, 'c-1');
    // A later retry of the same draft is answered from memory too.
    assert.equal((await confirmedSend(draft)).body.link.id, a.body.link.id);
    assert.equal(sends, 1);
    // Another draft with the same text is another message.
    await confirmedSend({ ...draft, clientId: 'c-2' });
    assert.equal(sends, 2);
  } finally {
    await server.close();
  }
});

test('a failed draft can be retried, and flood waits say how long', async () => {
  let tries = 0;
  const { server, confirmedSend } = await serverWith(async () => {
    tries += 1;
    if (tries === 1) {
      throw Object.assign(new Error('FLOOD_WAIT_12'), {
        code: 'flood-wait',
        retryAfter: 12,
      });
    }
    return { via: 'api' };
  });
  try {
    const draft = { source: 'vk', chat: '1', text: 'x', clientId: 'c-9' };
    const failed = await confirmedSend(draft);
    assert.equal(failed.status, 429);
    assert.equal(failed.body.code, 'flood-wait');
    assert.equal(failed.body.retryAfter, 12);
    const ok = await confirmedSend(draft);
    assert.equal(ok.status, 200);
    assert.equal(tries, 2);
  } finally {
    await server.close();
  }
});

test('/api/events streams chat links and never secrets', async () => {
  assert.equal(isStreamedId('msg:telegram:1:2'), true);
  assert.equal(isStreamedId('read:telegram:1'), true);
  assert.equal(isStreamedId('secret:telegram:user-session'), false);
  const { server, base, store } = await serverWith(async () => ({}));
  const controller = new AbortController();
  try {
    const res = await fetch(`${base}/api/events`, {
      signal: controller.signal,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const until = async (pattern) => {
      while (!pattern.test(text)) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        text += decoder.decode(value);
      }
    };
    await until(/event: ready/);
    await store.put({ id: 'secret:telegram:x', value: 'hidden' });
    await store.put({ id: 'msg:telegram:42:1', body: 'hello', chat: '42' });
    await until(/msg:telegram:42:1/);
    assert.ok(!text.includes('hidden'));
    assert.match(text, /event: link\ndata: \{"type":"put"/);
    const denied = await fetch(`${base}/api/events`, {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(denied.status, 403);
  } finally {
    controller.abort();
    await server.close();
  }
});

// ---- the chat: delivery, pending, order ------------------------------------

test('delivery status: sending, sent, read, failed, stored', () => {
  assert.equal(deliveryStatus({ sender: '42' }), null);
  assert.equal(
    deliveryStatus({ sender: 'me', id: 'msg:telegram:42:5' }, 4),
    'sent'
  );
  assert.equal(
    deliveryStatus({ sender: 'me', id: 'msg:telegram:42:5' }, 5),
    'read'
  );
  assert.equal(deliveryStatus({ sender: 'me', status: 'sending' }), 'sending');
  assert.equal(deliveryStatus({ sender: 'me', status: 'stored' }), 'stored');
  assert.equal(
    deliveryStatus({ sender: 'me', id: 'msg:vk:1:out-123' }, 999),
    'sent',
    'no network id, no read receipt to compare'
  );
});

test('pending messages follow the chat until their link arrives', () => {
  const base = {
    source: 'telegram',
    chat: '42',
    timestamp: '2026-10-17T10:00:00.000Z',
  };
  const links = [
    // Same second: the network's number keeps them in order.
    { ...base, id: 'msg:telegram:42:12', sender: '42', body: 'b' },
    { ...base, id: 'msg:telegram:42:11', sender: '42', body: 'a' },
  ];
  const pending = [
    {
      clientId: 'p1',
      key: 'telegram:42',
      source: 'telegram',
      chat: '42',
      text: 'mine',
      at: '2026-10-17T09:00:00.000Z',
      status: 'sending',
    },
    {
      clientId: 'p2',
      key: 'telegram:42',
      source: 'telegram',
      chat: '42',
      text: 'oops',
      at: '2026-10-17T10:00:01.000Z',
      status: 'failed',
      code: 'flood-wait',
    },
  ];
  const shown = chatMessages(links, 'telegram:42', { pending });
  assert.deepEqual(
    shown.map((m) => [m.body, m.delivery ?? null]),
    [
      ['a', null],
      ['b', null],
      ['mine', 'sending'],
      ['oops', 'failed'],
    ]
  );
  // The network's link for p1 arrives: the pending bubble gives way.
  const arrived = [
    ...links,
    {
      ...base,
      id: 'msg:telegram:42:13',
      sender: 'me',
      body: 'mine',
      clientId: 'p1',
      timestamp: '2026-10-17T10:00:02.000Z',
    },
  ];
  assert.deepEqual(
    chatMessages(arrived, 'telegram:42', { pending }).map((m) => m.body),
    ['a', 'b', 'mine', 'oops']
  );
  // Deleted messages leave the chat list too.
  assert.equal(summarizeChats([{ ...links[0], deleted: true }]).length, 0);
});

test('event batches put and delete links', () => {
  const links = [
    { id: 'a', body: 1 },
    { id: 'b', body: 2 },
  ];
  const next = applyLinkEvents(links, [
    { type: 'put', link: { id: 'a', body: 9 } },
    { type: 'delete', id: 'b' },
    { type: 'put', link: { id: 'c', body: 3 } },
  ]);
  assert.deepEqual(
    next.map((l) => [l.id, l.body]),
    [
      ['a', 9],
      ['c', 3],
    ]
  );
  assert.equal(applyLinkEvents(links, []), links, 'no events, no re-render');
  assert.equal(
    applyLinkEvents(null, [{ type: 'put', link: { id: 'x' } }]),
    null
  );
});

test('typing: the stream overrides the poll', async () => {
  const { mergeTyping } = await import('../src/web/chat-state.js');
  const at = '2026-10-17T10:00:00.000Z';
  const until = '2026-10-17T10:00:06.000Z';
  const now = Date.parse('2026-10-17T10:00:01.000Z');
  const typing = {
    id: 'typing:telegram:42:42',
    kind: 'typing',
    source: 'telegram',
    chat: '42',
    user: '42',
    state: 'typing',
    at,
    until,
  };
  assert.equal(mergeTyping([typing], [], 'telegram:42', now).length, 1);
  // Their message came in: the stream says idle, the poll is stale.
  const stopped = { ...typing, state: 'idle' };
  assert.equal(mergeTyping([typing], [stopped], 'telegram:42', now).length, 0);
  // Only the stream has seen it so far.
  assert.equal(mergeTyping([], [typing], 'telegram:42', now).length, 1);
  assert.equal(mergeTyping([], [typing], 'telegram:7', now).length, 0);
});
