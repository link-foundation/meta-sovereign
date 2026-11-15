import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { importInto, pullLiveInto } from '../src/sources/index.js';
import { importDownloadedFile } from '../src/sources/auto-import/files.js';
import { vkMessageLink } from '../src/sources/vk.js';
import { createVkInbox } from '../src/sources/vk-sync.js';
import { createVkOlder } from '../src/sources/vk-older.js';
import { loadPullState } from '../src/sources/pull-runner.js';
import {
  collectVkAttachments,
  listVkAttachments,
  saveVkAttachmentSettings,
} from '../src/sources/vk-attachment-metadata.js';
import { createVkAttachmentCommands } from '../src/cli/vk-attachment-commands.js';
import { runCli } from '../src/cli/index.js';
import { createOfflineClient } from '../src/web/client.js';
import { createVkAttachmentsApi } from '../src/web/vk-attachments-api.js';
import { dictionaries } from '../src/web/locales/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { createFakeVk, userMethods } from './helpers/fake-vk.js';
import {
  photo,
  attachmentMessage as message,
  attachmentArchive as archive,
  attachmentServer,
} from '../../experiments/issue-56/vk-attachments-fixture.mjs';

const enabledStore = async () => {
  const store = createMemoryStore();
  await saveVkAttachmentSettings(store, { enabled: true });
  return store;
};
const collected = async (store) => (await listVkAttachments(store)).items;
const importMessages = (store, ...messages) =>
  importInto(store, 'vk', archive(...messages));
const refusalStore = (store, shouldRefuse = async () => true) => ({
  ...store,
  flush: async () => {
    if (await shouldRefuse()) {
      throw Object.assign(new Error('Metadata flush refused'), {
        code: 'STORE_WRITE_FAILED',
      });
    }
    await store.flush?.();
  },
});

test(
  'VK archive collects only first incoming metadata with qualified identity and unchanged message counts',
  { timeout: 10000 },
  async () => {
    const store = await enabledStore();
    assert.equal(
      await importMessages(
        store,
        message(1, [
          photo(11, {
            empty: '',
            absent: null,
            access_key: 'private-fixture',
            nested: {
              empty: [],
              kept: false,
              number: 0,
              token: 'private-fixture',
            },
          }),
        ]),
        message(2, [
          photo(11, { text: 'Changed' }),
          photo(11, { owner_id: -42 }),
          { type: 'doc', doc: { id: 11, owner_id: 41, title: 'Document' } },
        ]),
        message(3, [photo(99)], { out: 1, from_id: 1 }),
        message(4, [{ type: 'sticker', sticker: { sticker_id: 13 } }])
      ),
      4
    );
    const rows = await collected(store);
    assert.equal(
      rows.length,
      4,
      'the actual archive ingestion must collect incoming attachments'
    );
    const first = rows.find((row) => row.id === 'attachment:vk:photo:41:11');
    assert.equal(first.messageId, 'msg:vk:1');
    assert.equal(first.metadata.text, 'First <script>fixture</script> 元数据');
    assert.deepEqual(first.metadata.nested, { kept: false, number: 0 });
    assert.equal(first.metadata.access_key, undefined);
    assert.equal(first.metadata.absent, undefined);
    assert.equal(first.metadata.empty, undefined);
    assert.ok(rows.some((row) => row.id === 'attachment:vk:photo:-42:11'));
    assert.ok(rows.some((row) => row.id === 'attachment:vk:doc:41:11'));
    assert.ok(rows.some((row) => row.id === 'attachment:vk:sticker:global:13'));
    await importMessages(
      store,
      message(5, [photo(11, { text: 'Another copy' })])
    );
    assert.deepEqual(await store.get(first.id), first);
  }
);

test(
  'collection requires opt-in, pause retains records and acknowledged settings survive restart',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-attachments-'));
    let store;
    try {
      const file = join(dir, 'links.lino');
      store = await createLinoTextStore(file);
      await importMessages(store, message(1));
      assert.deepEqual((await listVkAttachments(store)).settings, {
        enabled: false,
      });
      assert.equal((await collected(store)).length, 0);
      await saveVkAttachmentSettings(store, { enabled: true });
      await importMessages(store, message(2));
      const first = (await collected(store))[0];
      await saveVkAttachmentSettings(store, { enabled: false });
      await importMessages(store, message(3, [photo(12)]));
      await store.close();
      store = await createLinoTextStore(file);
      assert.deepEqual((await listVkAttachments(store)).settings, {
        enabled: false,
      });
      assert.deepEqual(await collected(store), [first]);
      await saveVkAttachmentSettings(store, { enabled: true });
      await importMessages(
        store,
        message(4, [photo(11, { text: 'Later' }), photo(13)])
      );
      assert.equal((await collected(store)).length, 2);
      assert.deepEqual(await store.get(first.id), first);
    } finally {
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('metadata budgets skip incomplete IDs, oversized records and outgoing/deleted/service messages', async () => {
  const store = await enabledStore();
  const oversized = 'x'.repeat(32769);
  const attachments = [
    photo(0),
    photo(-1),
    photo(2, { owner_id: 0 }),
    photo(3, { text: oversized }),
    photo(4, { sizes: Array(513).fill(0) }),
    { type: 'photo', photo: { owner_id: 41 } },
    { type: 'unknown', unknown: { id: 'bad', owner_id: 41 } },
    photo(7),
  ];
  const result = await collectVkAttachments(store, [
    vkMessageLink(message(1, attachments)),
    { ...vkMessageLink(message(2, [photo(8)])), outgoing: true },
    { ...vkMessageLink(message(3, [photo(9)])), deleted: true },
    { ...vkMessageLink(message(4, [photo(10)])), service: true },
    { ...vkMessageLink(message(5, [photo(11)])), source: 'telegram' },
  ]);
  assert.deepEqual(result, { created: 1, skipped: 7, paused: false });
  assert.equal((await collected(store))[0].externalId, '7');
  const many = await collectVkAttachments(store, [
    vkMessageLink(
      message(
        6,
        Array.from({ length: 103 }, (_, id) => photo(id + 100))
      )
    ),
  ]);
  assert.equal(many.created, 100);
  assert.equal(many.skipped, 3);
  const page = await listVkAttachments(store, { limit: 2 });
  assert.equal(page.items.length, 2);
  const next = await listVkAttachments(store, { limit: 2, after: page.next });
  assert.ok(next.items.every((row) => row.id > page.next));
  for (const limit of [0, 101, 1.5, NaN]) {
    await assert.rejects(listVkAttachments(store, { limit }));
  }
});

test('concurrent metadata collection serializes first observation and rolls back refused acknowledgements', async () => {
  const store = await enabledStore();
  await Promise.all([
    collectVkAttachments(store, [vkMessageLink(message(1))]),
    collectVkAttachments(store, [
      vkMessageLink(message(2, [photo(11, { text: 'Later' })])),
    ]),
  ]);
  assert.equal((await collected(store))[0].messageId, 'msg:vk:1');
  const broken = refusalStore(store);
  await assert.rejects(
    collectVkAttachments(broken, [vkMessageLink(message(3, [photo(12)]))]),
    /Metadata flush refused/u
  );
  assert.equal((await collected(store)).length, 1);
  await assert.rejects(
    saveVkAttachmentSettings(broken, { enabled: false }),
    /Metadata flush refused/u
  );
  assert.equal((await listVkAttachments(store)).settings.enabled, true);
  await assert.rejects(
    saveVkAttachmentSettings(store, { enabled: 'false' }),
    /boolean/u
  );
});

test(
  'live API cursor and older history wait for metadata acknowledgement and recover landed messages',
  { timeout: 10000 },
  async () => {
    const store = await enabledStore();
    const broken = refusalStore(store);
    const link = vkMessageLink(message(1));
    let acknowledged = 0;
    const options = {
      live: {
        pullMessages: async () => ({
          links: [link],
          rawCount: 1,
          afterStore: () => {
            acknowledged++;
          },
        }),
      },
    };
    await assert.rejects(
      pullLiveInto(broken, 'vk', options),
      /Metadata flush refused/u
    );
    assert.equal(acknowledged, 0);
    assert.ok(await store.get(link.id));
    assert.equal((await collected(store)).length, 0);
    await pullLiveInto(store, 'vk', options);
    assert.equal(acknowledged, 1);
    assert.equal((await collected(store)).length, 1);
    const olderLink = vkMessageLink(message(2, [photo(12)]));
    const context = async () => ({
      live: { pullMessages: async () => ({ links: [olderLink], rawCount: 1 }) },
    });
    await assert.rejects(
      createVkOlder({ store: broken, context })({ peerId: 41 }),
      /Metadata flush refused/u
    );
    const result = await createVkOlder({ store, context })({ peerId: 41 });
    assert.equal(result.imported, 0, 'landed message is not re-counted');
    assert.equal(
      (await collected(store)).length,
      2,
      'landed message still recovers missing metadata'
    );
  }
);

test(
  'actual Long Poll refuses cursor advancement on metadata failure and retries without duplicate collection',
  { timeout: 10000 },
  async () => {
    const store = await enabledStore();
    await store.put({
      id: 'secret:vk:access-token',
      token: 'fixture-vk-token',
    });
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getById': () => ({ items: [message(77)] }),
      }),
      poll: () => ({
        ts: '105',
        updates: [[4, 77, 1, 41, 1700000000, 'x', {}]],
      }),
    });
    const inbox = (backing) =>
      createVkInbox({
        store: backing,
        fetchImpl: fake.fetchImpl,
        baseUrl: fake.baseUrl,
        sleep: async () => {},
        requestsPerSecond: 1000,
      });
    await assert.rejects(
      inbox(
        refusalStore(store, async () => Boolean(await store.get('msg:vk:77')))
      ).step({ wait: 0 }),
      /Metadata flush refused/u
    );
    assert.equal((await loadPullState(store, 'vk')).ts, undefined);
    assert.ok(await store.get('msg:vk:77'));
    await inbox(store).step({ wait: 0 });
    assert.equal((await loadPullState(store, 'vk')).ts, '105');
    await inbox(store).step({ wait: 0 });
    assert.equal((await collected(store)).length, 1);
  }
);

test(
  'downloaded VK JSON and offline individual writes use the same collection',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-attachments-import-'));
    const store = await enabledStore();
    const client = createOfflineClient({ store, server: null });
    try {
      const filePath = join(dir, 'messages.json');
      await writeFile(filePath, JSON.stringify(archive(message(1))));
      const failed = await importDownloadedFile({
        store: refusalStore(store),
        provider: 'vk',
        filePath,
      });
      assert.equal(failed[0].aborted, true);
      assert.equal((await collected(store)).length, 0);
      const retry = await importDownloadedFile({
        store,
        provider: 'vk',
        filePath,
      });
      assert.equal(
        retry[0].imported,
        1,
        'preserve the importer’s existing canonical-message count'
      );
      assert.equal(retry[0].error, undefined);
      assert.equal((await collected(store)).length, 1);
      await client.put(vkMessageLink(message(2, [photo(12)])));
      assert.equal((await collected(store)).length, 2);
    } finally {
      await client.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('VK collection CLI opens read-only for listing, acknowledges configuration and always closes', async () => {
  const store = await enabledStore();
  await importMessages(store, message(1));
  const opened = [];
  let closed = 0;
  const open = (kind) => async (path) => {
    opened.push([kind, path]);
    return {
      ...store,
      close: () => {
        closed++;
      },
    };
  };
  const command = createVkAttachmentCommands({
    openStore: open('write'),
    openReadOnly: open('read'),
  })['vk-attachments'];
  let result;
  const log = (text) => {
    result = JSON.parse(text);
  };
  assert.equal(await command({ store: '/fixture', limit: '1' }, log), 0);
  assert.equal(result.items.length, 1);
  await command({ store: '/fixture', enabled: 'false' }, log);
  assert.equal(result.settings.enabled, false);
  assert.deepEqual(opened, [
    ['read', '/fixture'],
    ['write', '/fixture'],
  ]);
  assert.equal(closed, 2);
  await assert.rejects(command({ enabled: 'maybe' }, log), /true or false/u);
  assert.equal(opened.length, 2);
  await assert.rejects(command({ limit: '0' }, log));
  assert.equal(closed, 3);
  await assert.rejects(
    runCli(['vk-attachments', '--enabled=maybe'], { log }),
    /enabled must be true or false/u
  );
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `VK collection uses default ${type} routes and actual individual-link ingestion`,
    { timeout: 15000 },
    async () => {
      const fixture = await attachmentServer();
      const request = async (path, body, origin) => {
        const response = await fetch(`${fixture.base}${path}`, {
          method:
            body === undefined ? 'GET' : path === '/links' ? 'PUT' : 'POST',
          headers: {
            accept: type,
            'content-type': type,
            ...(origin ? { origin } : {}),
          },
          ...(body === undefined ? {} : { body: encodeWire(body, type) }),
        });
        assert.ok(response.headers.get('content-type').startsWith(type));
        return {
          status: response.status,
          body: await readWireResponse(response),
        };
      };
      try {
        const first = await request('/api/vk/attachments?limit=1');
        assert.equal(first.status, 200);
        assert.equal(first.body.items.length, 1);
        assert.ok(first.body.next);
        const next = await request(
          `/api/vk/attachments?after=${encodeURIComponent(first.body.next)}`
        );
        assert.equal(next.body.items.length, 2);
        assert.equal(
          (
            await request(
              '/api/vk/attachments',
              { enabled: false },
              'https://foreign.invalid'
            )
          ).status,
          403
        );
        assert.equal(
          (await request('/api/vk/attachments', { enabled: false })).body
            .settings.enabled,
          false
        );
        await request('/links', vkMessageLink(message(8, [photo(18)])));
        assert.equal((await collected(fixture.store)).length, 3);
        await request('/api/vk/attachments', { enabled: true });
        assert.equal(
          (await request('/links', vkMessageLink(message(9, [photo(19)]))))
            .status,
          200
        );
        assert.equal((await collected(fixture.store)).length, 4);
        assert.equal(
          (await request('/api/vk/attachments', { enabled: 'false' })).status,
          400
        );
        assert.equal(
          (await request('/api/vk/attachments?limit=101')).status,
          400
        );
        assert.equal(fixture.effects(), 0);
      } finally {
        await fixture.close();
      }
    }
  );
}

test('offline VK collection API and all four translations retain explicit configuration', async () => {
  const store = createMemoryStore();
  const api = createVkAttachmentsApi({
    get: async () => null,
    report: async () => null,
    local: async () => store,
  });
  assert.equal((await api.vkAttachments()).settings.enabled, false);
  await api.saveVkAttachmentCollection(true);
  await importMessages(store, message(1));
  assert.equal((await api.vkAttachments()).items.length, 1);
  await api.saveVkAttachmentCollection(false);
  assert.equal((await api.vkAttachments()).items.length, 1);
  const keys = Object.keys(dictionaries.en).filter((key) =>
    key.startsWith('vkAttachments.')
  );
  assert.equal(keys.length, 8);
  for (const lang of ['en', 'ru', 'hi', 'zh']) {
    for (const key of keys) {
      assert.equal(typeof dictionaries[lang][key], 'string', `${lang}:${key}`);
      assert.ok(dictionaries[lang][key].length);
    }
  }
});

test(
  'actual conversation catch-up and backfill collect metadata before saving their history offset',
  { timeout: 10000 },
  async () => {
    const store = await enabledStore();
    await store.put({
      id: 'secret:vk:access-token',
      token: 'fixture-vk-token',
    });
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getConversations': () => ({
          count: 1,
          items: [
            {
              conversation: { peer: { id: 41, type: 'user' } },
              last_message: message(9, [photo(19)]),
            },
          ],
        }),
        'messages.getHistory': () => ({
          count: 1,
          items: [message(8, [photo(18)])],
        }),
      }),
    });
    const inbox = createVkInbox({
      store,
      fetchImpl: fake.fetchImpl,
      baseUrl: fake.baseUrl,
      sleep: async () => {},
      requestsPerSecond: 1000,
    });
    const result = await inbox.fetch();
    assert.equal(result.imported, 2);
    assert.equal((await collected(store)).length, 2);
    assert.equal((await loadPullState(store, 'vk')).backfill['41'], 'done');
  }
);
