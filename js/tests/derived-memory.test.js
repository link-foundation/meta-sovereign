import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { wrapSecretStore } from '../src/storage/secret-store.js';
import { handleDerivedRoutes } from '../src/server/routes-derived.js';
import { createRawPacking } from '../src/storage/raw-packing.js';
import { createChatIndex } from '../src/server/chat-index.js';

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
