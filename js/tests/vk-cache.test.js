import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ordinaryCommandNames } from '../src/cli/command-names.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { createVkCache } from '../src/sources/vk-cache.js';
import {
  cacheId,
  cacheRequest,
  inspectVkCache,
} from '../src/sources/vk-cache-shape.js';
import { exportVkCache } from '../src/sources/vk-cache-export.js';
import {
  cacheFixture,
  cacheInput,
} from '../../experiments/issue-56/vk-cache-fixture.mjs';

test('foreground admission exposes the VK history cache command', () => {
  assert.equal(ordinaryCommandNames.has('vk-cache'), true);
});
test('bounded history resumes acknowledged pages across service reopen and reports complete only at the native end', async () => {
  const f = cacheFixture();
  assert.equal((await f.service.inspect(cacheInput)).cache, null);
  assert.equal(f.calls.length, 0);
  const first = await f.service.refresh(cacheInput);
  assert.equal(first.cache.count, 200);
  assert.equal(first.cache.complete, false);
  assert.equal(first.cache.nextOffset, 200);
  const reopened = createVkCache({ store: f.store, ...f.options });
  assert.equal((await reopened.refresh(cacheInput)).cache.count, 400);
  const last = await reopened.refresh(cacheInput);
  assert.equal(last.cache.count, 401);
  assert.equal(last.cache.complete, true);
  assert.equal(last.cache.nextOffset, null);
  const calls = f.calls.length;
  assert.equal(
    (await inspectVkCache(f.store, { ...cacheInput, pageOffset: 400 })).items[0]
      .id,
    1
  );
  assert.equal(f.calls.length, calls);
  assert.equal(
    (await f.service.inspect({ ...cacheInput, accountId: 2 })).cache,
    null
  );
});
test('all metadata caches retain successful empty/zero results, explicit expiry and provider-free inspection', async () => {
  const f = cacheFixture({ count: 0 });
  for (const kind of [
    'history',
    'conversation',
    'friends',
    'profile',
    'friend-count',
  ]) {
    const result = await f.service.refresh({ ...cacheInput, kind });
    assert.equal(result.cache.complete, true);
    assert.equal(result.cache.cacheKind, kind);
    const before = f.calls.length;
    const aged = await inspectVkCache(
      f.store,
      { ...cacheInput, kind },
      f.options.now() + 1200 * 86400000
    );
    assert.equal(aged.cache.stale, kind !== 'conversation');
    assert.equal(f.calls.length, before);
    if (kind === 'friend-count') {
      assert.equal(result.items[0].count, 0);
    }
    if (kind === 'history') {
      assert.equal(result.cache.count, 0);
    }
  }
  assert.ok(
    f.calls.every((call) =>
      [
        'users.get',
        'friends.get',
        'messages.getHistory',
        'messages.getConversationsById',
      ].includes(call.method)
    )
  );
});
test('invalid native pages, duplicated IDs and changed head/account/token refuse cursor advancement', async () => {
  for (const mode of [
    'malformed',
    'duplicate',
    'wrong-peer',
    'changed-head',
    'account',
    'token',
  ]) {
    const f = cacheFixture();
    await f.service.refresh(cacheInput);
    const old = await f.store.get(cacheId(cacheInput));
    if (mode === 'account') {
      f.account(2);
    } else if (mode === 'changed-head') {
      f.history[0].text = 'Changed after review';
    } else {
      f.hook((method, params) => {
        if (method !== 'messages.getHistory' || Number(params.offset) !== 200) {
          return undefined;
        }
        if (mode === 'token') {
          f.token('changed-token');
          return undefined;
        }
        const items = f.history.slice(200, 400).map((row) => ({ ...row }));
        if (mode === 'duplicate') {
          items[1].id = items[0].id;
        }
        if (mode === 'wrong-peer') {
          items[0].peer_id = 43;
        }
        return mode === 'malformed' ? { count: 401 } : { count: 401, items };
      });
    }
    await assert.rejects(f.service.refresh(cacheInput));
    assert.deepEqual(await f.store.get(old.id), old, mode);
  }
});
test('failed admitted index/page flush retains the previous acknowledged cursor and permits explicit retry', async () => {
  for (const target of ['page', 'index']) {
    const f = cacheFixture();
    await f.service.refresh(cacheInput);
    const old = await f.store.get(cacheId(cacheInput));
    const put = f.store.put.bind(f.store);
    let fail = false;
    f.store.put = async (row) => {
      const out = await put(row);
      if (
        target === 'page'
          ? row.kind === 'vk-cache-page'
          : row.kind === 'vk-cache'
      ) {
        fail = true;
      }
      return out;
    };
    f.store.flush = async () => {
      if (fail) {
        fail = false;
        throw new Error('Finite disk refusal');
      }
    };
    await assert.rejects(f.service.refresh(cacheInput), /disk refusal/u);
    assert.deepEqual(await f.store.get(old.id), old);
    f.store.put = put;
    f.store.flush = async () => {};
    assert.equal((await f.service.refresh(cacheInput)).cache.count, 400);
  }
});
test('causal metadata and concurrent refresh admission preserve a single complete page sequence', async () => {
  const store = withCausalWrites(createMemoryStore(), {
    deviceId: 'vk-cache-fixture',
  });
  const f = cacheFixture({ store });
  await Promise.all([
    f.service.refresh(cacheInput),
    f.service.refresh(cacheInput),
  ]);
  assert.equal((await f.service.inspect(cacheInput)).cache.count, 400);
  assert.equal((await f.service.refresh(cacheInput)).cache.count, 401);
});
test('export writes oldest-first linked Markdown/native JSON with reply evidence, bounded lines and exact coverage', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-vk-cache-export-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const f = cacheFixture();
  f.history[0].text = Array.from(
    { length: 1600 },
    (_, i) => `Long line ${i}`
  ).join('\n');
  await f.service.refresh({ ...cacheInput, maxPages: 3 });
  const before = f.calls.length;
  const folder = path.join(root, 'new-export');
  const out = await exportVkCache(
    f.store,
    { ...cacheInput, folder },
    { storeDir: path.join(root, 'store') }
  );
  assert.equal(out.messages, 401);
  assert.equal(out.coverage.complete, true);
  const originals = [];
  let markdown = '';
  for (const file of out.files) {
    const content = await fs.readFile(path.join(folder, file), 'utf8');
    assert.ok(content.split('\n').length <= 1500, file);
    if (file.endsWith('.md')) {
      markdown += content;
    }
    if (/^history-\d+\.json$/u.test(file)) {
      originals.push(
        ...JSON.parse(content).messages.filter((row) => !row.continuation)
      );
    }
  }
  assert.deepEqual(
    originals.map((row) => row.id),
    Array.from({ length: 401 }, (_, i) => i + 1)
  );
  assert.deepEqual(originals.at(-1).raw, f.history[0]);
  assert.ok(markdown.includes('> Original'));
  assert.match(markdown, /\]\(https:\/\/vk\.com\/id42\)/u);
  assert.ok(markdown.includes('[Structured data]'));
  assert.equal(f.calls.length, before);
  await assert.rejects(
    exportVkCache(f.store, { ...cacheInput, folder }),
    /exist/iu
  );
});
test('partial/expired export stays explicitly partial; wrong directories and corrupted cached pages refuse', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-vk-cache-safety-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const f = cacheFixture();
  const { cache } = await f.service.refresh(cacheInput);
  const out = await exportVkCache(
    f.store,
    { ...cacheInput, folder: path.join(root, 'partial') },
    { now: () => f.options.now() + 40 * 86400000 }
  );
  assert.equal(out.coverage.complete, false);
  assert.equal(out.coverage.stale, true);
  assert.equal(out.coverage.nextOffset, 200);
  for (const folder of ['relative', path.join(root, 'store', 'inside')]) {
    await assert.rejects(
      exportVkCache(
        f.store,
        { ...cacheInput, folder },
        { storeDir: path.join(root, 'store') }
      )
    );
  }
  const page = await f.store.get(cache.pages[0].id);
  page.items = [...page.items];
  page.items[0] = { ...page.items[0], text: 'Tampered' };
  await f.store.put(page);
  await assert.rejects(f.service.inspect(cacheInput), /evidence/u);
  await assert.rejects(
    exportVkCache(f.store, {
      ...cacheInput,
      folder: path.join(root, 'corrupt'),
    }),
    /evidence/u
  );
});
test('cache request bounds are strict and rejected before provider reads', async () => {
  for (const patch of [
    { accountId: 0 },
    { accountId: -1 },
    { peerId: 0 },
    { maxPages: 0 },
    { maxPages: 51 },
    { restart: 'yes' },
    { kind: 'unknown' },
  ]) {
    assert.throws(() => cacheRequest({ ...cacheInput, ...patch }));
  }
});

test('saved coverage, page ownership and missing cached offsets refuse without contacting VK', async () => {
  const f = cacheFixture();
  const { cache } = await f.service.refresh(cacheInput);
  const before = f.calls.length;
  await assert.rejects(
    f.service.inspect({ ...cacheInput, pageOffset: 1 }),
    /evidence/u
  );
  for (const patch of [
    { complete: true, nextOffset: null },
    { expiresAt: null },
    { headHash: 'invalid' },
  ]) {
    await f.store.put({ ...cache, ...patch });
    await assert.rejects(f.service.inspect(cacheInput), /evidence/u);
  }
  await f.store.put(cache);
  const page = await f.store.get(cache.pages[0].id);
  await f.store.put({ ...page, accountId: 2 });
  await assert.rejects(f.service.inspect(cacheInput), /evidence/u);
  await assert.rejects(
    exportVkCache(f.store, { ...cacheInput, kind: 'profile' }),
    /Only message history/u
  );
  assert.equal(f.calls.length, before);
});

test('cache tracing defaults off and explicit debug excludes tokens and message content', async () => {
  const f = cacheFixture();
  const logs = [];
  const service = (debug) =>
    createVkCache({
      store: f.store,
      ...f.options,
      debug,
      log: (event) => logs.push(event),
    });
  await service(false).refresh(cacheInput);
  assert.deepEqual(logs, []);
  await service(true).refresh(cacheInput);
  assert.deepEqual(logs, [
    {
      level: 'debug',
      event: 'vk_cache_page',
      cacheKind: 'history',
      offset: 200,
      count: 200,
      complete: false,
    },
  ]);
});
