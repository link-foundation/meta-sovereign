// Issue #31 / PR #34: the reply service learns the message-to-message
// graph from the store, keeps learning from new messages in real time,
// and answers two-stage autocomplete for a chat's last incoming message.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import { createMemoryStore } from '../src/storage/index.js';
import { createReplyService } from '../src/replies/reply-service.js';

let seq = 0;
// An hour ago: recent enough to be answered.
const BASE = Date.now() - 60 * 60_000;
const msg = (chat, sender, body, minute) => ({
  id: `msg:vk:${++seq}`,
  source: 'vk',
  chat,
  sender,
  body,
  timestamp: new Date(BASE + minute * 60_000).toISOString(),
});

const seeded = async () => {
  const store = createMemoryStore();
  for (const m of [
    msg('1', 'u1', 'Привет!', 0),
    msg('1', 'me', 'Привет, как дела?', 1),
    msg('2', 'u2', 'привет', 0),
    msg('2', 'me', 'Привет, как дела?', 2),
    msg('3', 'u3', 'Привет', 0),
    msg('3', 'me', 'Здравствуйте!', 3),
    msg('4', 'u4', 'Привет', 5),
  ]) {
    await store.put(m);
  }
  return store;
};

test('suggests deduplicated replies to the chat’s last incoming message', async () => {
  const service = createReplyService({ store: await seeded() });
  const out = await service.autocomplete({ source: 'vk', chat: '4' });
  assert.equal(out.stage, 'reply');
  assert.equal(out.lastMessage, 'Привет');
  assert.equal(out.backend, 'memory');
  // Nothing typed: only the typical reply; a one-off shows once typed.
  assert.deepEqual(
    out.suggestions.map((s) => [s.text, s.count]),
    [['Привет, как дела?', 2]]
  );
  const typed = await service.autocomplete({
    source: 'vk',
    chat: '4',
    typed: 'Зд',
  });
  assert.deepEqual(
    typed.suggestions.map((s) => [s.text, s.count]),
    [['Здравствуйте!', 1]]
  );
  await service.close();
});

test('a message long past answering gets no replies', async () => {
  const store = await seeded();
  const later = Date.now() + 8 * 86_400_000;
  const service = createReplyService({ store, now: () => later });
  const out = await service.autocomplete({ source: 'vk', chat: '4' });
  assert.deepEqual([out.stage, out.lastMessage], ['none', '']);
  await service.close();
});

test('while typing, our whole messages come first, then words', async () => {
  const service = createReplyService({ store: await seeded() });
  const out = await service.autocomplete({
    lastMessage: 'Что нового?',
    typed: 'Здр',
  });
  assert.equal(out.stage, 'message');
  assert.equal(out.suggestions[0].text, 'Здравствуйте!');
  const words = await service.autocomplete({ typed: 'При' });
  assert.ok(words.suggestions.some((s) => s.kind === 'word'));
  const nearlyTyped = await service.autocomplete({ typed: 'Прив' });
  assert.ok(nearlyTyped.suggestions.every((s) => s.kind !== 'word'));
  await service.close();
});

test('nothing is suggested to answer once our message is the last', async () => {
  const store = await seeded();
  await store.put(msg('4', 'me', 'Уже ответил', 6));
  const service = createReplyService({ store });
  const out = await service.autocomplete({ source: 'vk', chat: '4' });
  assert.deepEqual(
    [out.stage, out.suggestions, out.lastMessage],
    ['none', [], '']
  );
  await store.put(msg('4', 'u4', 'Привет', 7));
  const again = await service.autocomplete({ source: 'vk', chat: '4' });
  assert.equal(again.stage, 'reply');
  await service.close();
});

test('learns new replies in real time from store puts', async () => {
  const store = await seeded();
  const service = createReplyService({ store });
  await service.ready();
  await store.put(msg('4', 'me', 'Здравствуйте!', 6));
  await store.put(msg('5', 'u5', 'Привет', 7));
  await store.put(msg('5', 'me', 'Здравствуйте!', 8));
  await store.put(msg('6', 'u6', 'Привет', 9));
  const out = await service.autocomplete({ source: 'vk', chat: '6' });
  assert.deepEqual(
    out.suggestions.map((s) => [s.text, s.count]),
    [
      ['Здравствуйте!', 3],
      ['Привет, как дела?', 2],
    ]
  );
  await service.close();
});

test('a deleted message makes the next request relearn from the store', async () => {
  const store = await seeded();
  const service = createReplyService({ store });
  await service.ready();
  const [first] = (await store.query()).filter((l) => l.sender === 'me');
  await store.delete(first.id);
  const out = await service.autocomplete({
    lastMessage: 'Привет',
    typed: 'Привет, как',
  });
  assert.deepEqual(
    out.suggestions
      .filter((s) => s.kind === 'reply')
      .map((s) => [s.text, s.count]),
    [['Привет, как дела?', 1]]
  );
  await service.close();
});

test('mirrors the graph into a clink store without blocking suggestions', async () => {
  const opened = [];
  const learned = [];
  const clink = {
    available: true,
    open: async (pairs) => {
      opened.push(pairs);
    },
    learn: async (pair) => {
      learned.push(pair);
    },
    close: async () => {},
  };
  const store = await seeded();
  const service = createReplyService({ store, clink });
  assert.equal((await service.stats()).pairs, 3);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await service.stats()).mirror, 'ready');
  assert.equal(opened[0].length, 2);
  await store.put(msg('4', 'me', 'Здравствуйте!', 6));
  assert.deepEqual(learned, [
    {
      prompt: 'Привет',
      reply: 'Здравствуйте!',
      at: new Date(BASE + 6 * 60_000).toISOString(),
    },
  ]);
  await service.close();
});

test('a failing clink mirror is reported, suggestions keep working', async () => {
  const clink = {
    available: true,
    open: async () => {
      throw new Error('clink is broken');
    },
    learn: async () => {},
    close: async () => {},
  };
  const service = createReplyService({ store: await seeded(), clink });
  await service.ready();
  await new Promise((resolve) => setImmediate(resolve));
  const stats = await service.stats();
  assert.equal(stats.mirror, 'error');
  assert.equal(stats.mirrorError, 'clink is broken');
  const out = await service.autocomplete({ lastMessage: 'привет' });
  assert.equal(out.stage, 'reply');
  await service.close();
});

test('GET /api/suggest answers for a chat over HTTP', async () => {
  const { startServer } = await import('../src/server/index.js');
  const server = await startServer({
    store: await seeded(),
    enableSync: false,
    enableHandlers: false,
  });
  try {
    const base = `http://127.0.0.1:${server.port}`;
    const reply = await (
      await fetch(`${base}/api/suggest?source=vk&chat=4&typed=Здр`)
    ).json();
    assert.equal(reply.stage, 'reply');
    assert.deepEqual(
      reply.suggestions.map((s) => s.text),
      ['Здравствуйте!']
    );
    const words = await (
      await fetch(
        `${base}/api/suggest?last=${encodeURIComponent('Ок')}&typed=Прив`
      )
    ).json();
    assert.equal(words.stage, 'message');
    const stats = await (await fetch(`${base}/api/suggest/stats`)).json();
    assert.equal(stats.pairs, 3);
    assert.equal(stats.mirror, 'unavailable');
  } finally {
    await server.close();
  }
});
