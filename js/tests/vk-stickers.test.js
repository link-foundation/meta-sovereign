import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ordinaryCommandNames } from '../src/cli/command-names.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { createVkStickerCatalog } from '../src/sources/vk-sticker-catalog.js';
import { inspectVkStickerCatalog } from '../src/sources/vk-sticker-cache.js';
import {
  catalogId,
  catalogQuery,
  filterReceivedVkStickers,
} from '../src/sources/vk-sticker-shape.js';
import { exportVkStickerCatalog } from '../src/sources/vk-sticker-export.js';
import {
  stickerFixture,
  stickerInput,
} from '../../experiments/issue-56/vk-stickers-fixture.mjs';

test('foreground admission exposes the VK sticker catalog command', () => {
  assert.equal(ordinaryCommandNames.has('vk-stickers'), true);
});
test('native catalog preserves all greeting IDs and exact ownership, permission, keywords and previews', async () => {
  const f = stickerFixture();
  assert.equal((await f.service.inspect(stickerInput)).catalog, null);
  assert.equal(f.calls.length, 0);
  const out = await f.service.refresh(stickerInput);
  assert.deepEqual(out.catalog.greetingIds, ['101', '102']);
  assert.equal(out.catalog.packs, 3);
  assert.equal(out.catalog.stickers, 107);
  assert.equal(out.catalog.usable, 103);
  assert.equal(out.items.length, 100);
  assert.equal(out.next, 100);
  const first = out.items[0];
  assert.equal(first.previewUrl, 'https://vk.com/sticker/101-512');
  assert.equal(
    first.previewWithBackground,
    'https://vk.com/sticker/101-background'
  );
  assert.equal(first.lightPreviewUrl, 'https://vk.com/sticker/101-light');
  assert.equal(first.darkPreviewUrl, 'https://vk.com/sticker/101-dark');
  assert.deepEqual(first.keywords, ['привет', 'hello']);
  assert.equal(first.fixture_private, undefined);
  const all = await f.service.inspect({
    ...stickerInput,
    usableOnly: false,
    offset: 100,
  });
  assert.equal(all.items.find((item) => item.id === '401').usable, false);
  assert.equal(all.items.find((item) => item.id === '301').usable, false);
  const calls = f.calls.length;
  for (const [query, expected] of [
    [{ category: 'greeting' }, ['101', '102']],
    [{ category: 'birthday' }, ['103']],
    [{ q: 'thanks' }, ['104']],
    [{ packId: 13, usableOnly: false }, ['401']],
  ]) {
    assert.deepEqual(
      (await f.service.inspect({ ...stickerInput, ...query })).items.map(
        (item) => item.id
      ),
      expected
    );
  }
  assert.equal(f.calls.length, calls);
  assert.ok(
    f.calls.every((call) =>
      ['users.get', 'store.getProducts', 'store.getStickersKeywords'].includes(
        call.method
      )
    )
  );
});
test('empty successful native catalog is acknowledged; account-scoped cached reads never call the provider', async () => {
  const f = stickerFixture({ count: 0 });
  const out = await f.service.refresh(stickerInput);
  assert.equal(out.catalog.stickers, 0);
  const reads = f.calls.length;
  assert.equal(
    (await inspectVkStickerCatalog(f.store, stickerInput)).catalog.stickers,
    0
  );
  assert.equal((await f.service.inspect({ accountId: 2 })).catalog, null);
  assert.equal(f.calls.length, reads);
});
test('partial, malformed, duplicated, changed-account/token and changed-catalog reads preserve the acknowledged snapshot', async () => {
  for (const mode of [
    'count',
    'chunks',
    'words',
    'duplicate',
    'pack',
    'account',
    'token',
    'changed',
  ]) {
    const f = stickerFixture();
    await f.service.refresh(stickerInput);
    const old = await f.store.get(catalogId(1));
    let reads = 0;
    f.hook((method) => {
      if (method !== 'store.getStickersKeywords') {
        return undefined;
      }
      reads++;
      if (mode === 'account') {
        f.account(2);
      } else if (mode === 'token') {
        f.token('changed');
      } else if (mode === 'duplicate') {
        f.packs[0].stickers[1].sticker_id = 101;
      } else if (mode === 'pack') {
        f.dictionary[0].user_stickers[0].product_id = 12;
      } else if (mode === 'changed' && reads === 2) {
        f.dictionary[0].words.push('Changed after first read');
      }
      return {
        count: mode === 'count' ? 500 : f.dictionary.length,
        dictionary: mode === 'words' ? [{ words: 'invalid' }] : f.dictionary,
        ...(mode === 'chunks' ? { chunks_count: 2 } : {}),
      };
    });
    await assert.rejects(f.service.refresh(stickerInput), undefined, mode);
    assert.deepEqual(await f.store.get(old.id), old, mode);
  }
});
test('unacknowledged writes roll back and explicit retry can save the next catalog', async () => {
  const f = stickerFixture();
  await f.service.refresh(stickerInput);
  const old = await f.store.get(catalogId(1));
  let fail = true;
  f.store.flush = async () => {
    if (fail) {
      fail = false;
      throw new Error('Finite disk refusal');
    }
  };
  f.packs[0].title = 'Updated title';
  await assert.rejects(f.service.refresh(stickerInput), /disk refusal/u);
  assert.deepEqual(await f.store.get(old.id), old);
  assert.equal(
    (await f.service.refresh(stickerInput)).items[0].pack,
    'Updated title'
  );
});
test('causal catalog survives text-store close/reopen and concurrent refreshes serialize', async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'vk-catalog-reopen-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const open = async () =>
    withCausalWrites(
      await createLinoTextStore(path.join(folder, 'state.lino'))
    );
  let store = await open();
  try {
    const f = stickerFixture({ store });
    await Promise.all([
      f.service.refresh(stickerInput),
      f.service.refresh(stickerInput),
    ]);
    await store.close();
    store = await open();
    const reopened = createVkStickerCatalog({
      store,
      source: () => {
        throw new Error('Offline');
      },
    });
    assert.deepEqual(
      (await reopened.inspect(stickerInput)).catalog.greetingIds,
      ['101', '102']
    );
  } finally {
    await store.close();
  }
});
test('received attachment filtering supports reference maps and stored metadata without assuming send permission', () => {
  assert.deepEqual(
    filterReceivedVkStickers({
      101: { productId: 11 },
      102: { productId: 11, token: 'never exported' },
      999: { type: 'photo' },
      401: { productId: 13 },
    }),
    {
      ok: true,
      stickers: [
        { id: 101, packId: 11 },
        { id: 102, packId: 11 },
        { id: 401, packId: 13 },
      ],
      products: [11, 13],
    }
  );
  assert.deepEqual(
    filterReceivedVkStickers([
      {
        id: 'attachment:vk:101',
        externalId: '101',
        metadata: { product_id: 11 },
      },
      { sticker_id: 401, product_id: 13 },
    ]).products,
    [11, 13]
  );
  assert.throws(() => filterReceivedVkStickers(null));
});
test('metadata export is provider-free, exclusive and bounded to 1500 lines with exact coverage', async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'vk-sticker-export-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const f = stickerFixture({ count: 1000 });
  f.packs[1].stickers[0].sticker_id = 30001;
  f.packs[2].stickers[0].sticker_id = 40001;
  f.dictionary[0].promoted_stickers[0].sticker_id = 40001;
  f.packs.push({
    ...f.packs[0],
    id: 14,
    stickers: f.packs[0].stickers.map((row) => ({
      ...row,
      sticker_id: row.sticker_id + 10000,
    })),
  });
  await f.service.refresh(stickerInput);
  const calls = f.calls.length;
  const input = {
    ...stickerInput,
    folder: path.join(folder, 'new'),
    attachments: { 101: { productId: 11 } },
  };
  const out = await exportVkStickerCatalog(f.store, input);
  assert.equal(out.artworkDownloaded, false);
  let stickers = 0;
  for (const [key, files] of Object.entries(out.files)) {
    for (const file of files) {
      const content = await fs.readFile(path.join(out.folder, file), 'utf8');
      assert.ok(content.split('\n').length <= 1500);
      assert.doesNotMatch(
        content,
        /must not survive|access_token|fixture-stickers-token/u
      );
      if (key === 'stickers') {
        stickers += JSON.parse(content).length;
      }
    }
  }
  assert.equal(stickers, 1996);
  assert.equal(out.files.stickers.length, 2);
  assert.equal(f.calls.length, calls);
  await assert.rejects(exportVkStickerCatalog(f.store, input), /exist/iu);
  await fs.mkdir(path.join(folder, 'store'));
  await fs.symlink(path.join(folder, 'store'), path.join(folder, 'link'));
  for (const destination of [
    'relative',
    path.join(folder, 'store', 'inside'),
    path.join(folder, 'link', 'inside'),
  ]) {
    await assert.rejects(
      exportVkStickerCatalog(
        f.store,
        { ...input, folder: destination },
        { storeDir: path.join(folder, 'store') }
      )
    );
  }
});
test('corrupt saved hashes and invalid filters refuse before provider work; tracing defaults off', async () => {
  const f = stickerFixture({ store: createMemoryStore() });
  const logs = [];
  const make = (debug) =>
    createVkStickerCatalog({
      store: f.store,
      ...f.options,
      debug,
      log: (event) => logs.push(event),
    });
  await make(false).refresh(stickerInput);
  assert.deepEqual(logs, []);
  await make(true).refresh(stickerInput);
  assert.deepEqual(logs, [
    {
      level: 'debug',
      event: 'vk_sticker_catalog_saved',
      packs: 3,
      stickers: 107,
    },
  ]);
  for (const patch of [
    { offset: -1 },
    { offset: 20001 },
    { usableOnly: 'true' },
    { category: 'invalid' },
    { q: 'a'.repeat(101) },
    { packId: -1 },
  ]) {
    assert.throws(() => catalogQuery(patch));
  }
  const old = await f.store.get(catalogId(1));
  await f.store.put({ ...old, dataHash: 'invalid' });
  const calls = f.calls.length;
  await assert.rejects(f.service.inspect(stickerInput), /evidence/u);
  await assert.rejects(f.service.refresh({ accountId: 0 }));
  assert.equal(f.calls.length, calls);
});
