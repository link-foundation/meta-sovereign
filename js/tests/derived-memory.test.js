import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { wrapSecretStore } from '../src/storage/secret-store.js';
import { handleDerivedRoutes } from '../src/server/routes-derived.js';
import { createRawPacking } from '../src/storage/raw-packing.js';
import { createChatIndex } from '../src/server/chat-index.js';
import { collectMetrics } from '../src/server/metrics.js';
import { extractFacts } from '../src/facts/index.js';
import { planFromStore, planGreetings } from '../src/greetings/plan.js';
import {
  streamedAudience,
  streamedCompletions,
  streamedSearch,
} from '../src/server/streamed-analysis.js';

const route = async (store, path) => {
  let result;
  await handleDerivedRoutes(
    store,
    { method: 'GET' },
    {
      writeHead: () => {},
      end: (body) => {
        result = JSON.parse(body);
      },
    },
    path,
    new URL(`http://localhost${path}`),
    { diskFree: async () => 1024 ** 4 }
  );
  return result;
};
test('status and contacts scan metadata without querying/materializing provider payloads', async () => {
  const store = createMemoryStore({
    retain: (link) =>
      Object.defineProperty({ ...link }, 'raw', {
        enumerable: true,
        get: () => {
          throw new Error('decoded a raw payload');
        },
      }),
  });
  await store.put({
    id: 'msg:telegram:1:1',
    sender: 'peer',
    senderName: 'Person',
    chat: '1',
    source: 'telegram',
    timestamp: '2026-10-29T12:00:00Z',
  });
  await store.put({
    id: 'person:telegram:peer',
    source: 'telegram',
    user: 'peer',
    contact: true,
  });
  await store.put({ id: 'message-version:1' });
  store.query = () => {
    throw new Error('queried the entire store');
  };
  const status = await route(store, '/api/status');
  assert.equal(status.messages, 1);
  assert.equal(status.links, 3);
  assert.equal(status.contacts, 1);
  const contacts = await route(store, '/api/contacts');
  assert.equal(contacts[0].name, 'Person');
  assert.equal(contacts[0].contact, true);
  const health = await route(store, '/api/health');
  assert.ok(health.memory.heapUsed > 0);
  assert.ok(health.memory.heapLimit > health.memory.heapUsed);
  assert.deepEqual(
    await route(store, '/api/facts'),
    { facts: [], byAnswerer: {} },
    'no patterns does not copy history'
  );
  const metrics = await collectMetrics(store);
  assert(metrics.includes('meta_sovereign_links_total 3'));
});

test('manual fact extraction never joins unrelated chats and caps output', () => {
  const messages = [
    {
      source: 'telegram',
      chat: '1',
      sender: 'me',
      body: 'Question?',
      timestamp: '2026-01-01T01:00:00Z',
    },
    {
      source: 'telegram',
      chat: '2',
      sender: 'other',
      body: 'Wrong answer',
      timestamp: '2026-01-01T01:00:01Z',
    },
    {
      source: 'telegram',
      chat: '1',
      sender: 'peer',
      body: 'Actual answer',
      timestamp: '2026-01-01T01:00:02Z',
    },
  ];
  const found = extractFacts(
    messages,
    [{ id: 'pattern:q', regex: /Question/ }],
    { limit: 1 }
  );
  assert.equal(found.facts.length, 1);
  assert.equal(found.facts[0].answer, 'Actual answer');
});

test('legacy analysis streams safe projections without raw payloads or structural arrays', async () => {
  const store = createMemoryStore({
    retain: (link) => {
      const held = { ...link };
      for (const field of ['raw', 'tokens', 'children']) {
        Object.defineProperty(held, field, {
          get: () => assert.fail(`analysis expanded ${field}`),
          enumerable: true,
        });
      }
      return held;
    },
  });
  await store.put({
    id: 'msg:telegram:7:1',
    source: 'telegram',
    chat: '7',
    chatType: 'personal_chat',
    sender: 'me',
    body: 'Hello world',
    timestamp: '2026-10-30T00:00:00Z',
  });
  await store.put({
    id: 'msg:telegram:7:2',
    source: 'telegram',
    chat: '7',
    chatType: 'personal_chat',
    sender: '7',
    senderName: 'Alice',
    body: 'Hello there',
    timestamp: '2026-10-31T00:00:00Z',
  });
  store.query = () => assert.fail('whole-store query forbidden');
  assert.deepEqual(await streamedCompletions(store, { prefix: 'Hello' }), [
    'Hello world',
  ]);
  const audience = await streamedAudience(store, 'network:telegram');
  assert.equal(audience[0].name, 'Alice');
  const found = await streamedSearch(store, { query: 'Hello', min: 0.2 });
  assert.equal(found.length, 2);
  assert.equal(Object.hasOwn(found[0].link, 'raw'), false);
});

test('greeting previews retain chat summaries and preserve blocked contacts without archive copies', async () => {
  const fixtures = [
    {
      id: 'msg:vk:7:1',
      source: 'vk',
      chat: '7',
      sender: '7',
      body: 'Hi!',
      timestamp: 1000,
    },
    {
      id: 'msg:vk:8:1',
      source: 'vk',
      chat: '8',
      sender: '8',
      body: 'Hi!',
      timestamp: 1000,
      blockedUs: true,
    },
  ];
  const store = createMemoryStore({
    retain: (link) => {
      for (const field of ['raw', 'tokens', 'children']) {
        Object.defineProperty(link, field, {
          enumerable: true,
          get: () => assert.fail(`preview expanded ${field}`),
        });
      }
      return link;
    },
  });
  for (const link of fixtures) {
    await store.put({ ...link });
  }
  const query = store.query.bind(store);
  store.query = (filter) =>
    query((link) => {
      const selected = filter(link);
      assert.ok(
        !selected || !link.id.startsWith('msg:'),
        'copied archive message'
      );
      return selected;
    });
  const options = { mode: 'reply', random: () => 0 };
  assert.deepEqual(
    await planFromStore(store, options),
    planGreetings({ links: fixtures, ...options })
  );
});
test('encrypted-store streaming preserves secret filtering and arbitrary projections', async () => {
  const store = wrapSecretStore({
    inner: createMemoryStore(),
    passphrase: 'fixture passphrase',
  });
  await store.put({ id: 'secret:one', value: 'hidden' });
  await store.put({ id: 'plain:one', value: 'hidden' });
  await store.put({ id: 'plain:two', value: 'other' });
  const ids = [];
  await store.scan(
    (link) => link.value === 'hidden',
    2,
    (batch) => ids.push(...batch),
    (link) => link.id
  );
  assert.deepEqual(ids.sort(), ['plain:one', 'secret:one']);
});

test('chat-index bootstrap preserves topics and history using metadata only', async () => {
  const packing = createRawPacking();
  let reading = false;
  const store = createMemoryStore({
    retain: packing.retain,
    release: packing.release,
    copy: (link) => {
      assert.ok(reading, 'bootstrap must not copy entire message records');
      return packing.copy(link);
    },
  });
  const chat = 'telegram:-1005';
  const fixtures = [
    { id: 11, raw: { replyTo: { forumTopic: true, replyToTopId: 7 } } },
    {
      id: 12,
      raw: { id: 12, action: { className: 'MessageActionTopicCreate' } },
    },
    { id: 13, topic: 7, deleted: true, versionCount: 2, raw: {} },
  ];
  for (const fixture of fixtures) {
    const record = packing.pack({
      ...fixture,
      id: `msg:${chat}:${fixture.id}`,
      source: 'telegram',
      chat: '-1005',
      timestamp: `2026-10-29T12:00:${fixture.id}Z`,
      raw: { ...fixture.raw, text: 'cold payload '.repeat(100) },
    });
    Object.defineProperty(record, 'raw', {
      enumerable: true,
      configurable: true,
      get() {
        return assert.fail('bootstrap decoded a cold payload');
      },
    });
    await store.put(record);
  }
  const index = createChatIndex(store);
  try {
    await index.ready();
    assert.equal(index.count(chat), 2);
    assert.deepEqual(await index.deleted(chat), [`msg:${chat}:13`]);
    assert.deepEqual(await index.edited(`${chat}#topic:7`), [`msg:${chat}:13`]);
    reading = true;
    for (const [topic, id] of [
      [7, 11],
      [12, 12],
    ]) {
      const page = await index.page(`${chat}#topic:${topic}`);
      assert.deepEqual(
        page.messages.map((link) => link.id),
        [`msg:${chat}:${id}`]
      );
    }
  } finally {
    index.close();
  }
});
