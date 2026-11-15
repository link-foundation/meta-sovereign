import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createVkCacheCommands } from '../src/cli/vk-cache-commands.js';
import { createVkCacheApi } from '../src/web/vk-cache-api.js';
import { createWirePost } from './helpers/http-wire.mjs';
import { assertVkTranslations } from './helpers/vk-policy-interfaces.mjs';
import {
  cacheFixture,
  cacheServer,
  cacheInput,
} from '../../experiments/issue-56/vk-cache-fixture.mjs';

test(
  'both Lino encodings share account-scoped cache refresh, inspection, export and origin refusal',
  { timeout: 15000 },
  async () => {
    const f = await cacheServer();
    try {
      for (const encoding of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(f.base, '/api/vk/cache', encoding);
        assert.equal(
          (await post('/refresh', cacheInput, 'https://untrusted.example'))
            .status,
          403
        );
        const refreshed = await post('/refresh', {
          ...cacheInput,
          restart: true,
        });
        assert.equal(refreshed.answer.cache.count, 200);
        assert.equal(refreshed.answer.cache.complete, false);
        const before = f.calls.length;
        assert.equal(
          (await post('/inspect', cacheInput)).answer.items.length,
          200
        );
        assert.equal(f.calls.length, before);
        const exported = await post('/export', {
          ...cacheInput,
          folder: path.join(
            f.folder,
            encoding === LINO_TEXT ? 'text-export' : 'binary-export'
          ),
        });
        assert.equal(exported.answer.messages, 200);
        assert.equal(exported.answer.coverage.complete, false);
        assert.equal(f.calls.length, before);
        assert.equal(
          (await post('/refresh', { ...cacheInput, accountId: 2 })).answer.ok,
          false
        );
      }
      assert.equal(f.stats().messages, 0);
    } finally {
      await f.close();
    }
  }
);
test('offline inspection uses the same saved cache while refresh/export require a server, with all four locales', async () => {
  const f = cacheFixture();
  await f.service.refresh(cacheInput);
  const before = f.calls.length;
  const api = createVkCacheApi({
    report: async () => null,
    local: async () => f.store,
  });
  assert.equal((await api.inspectVkCache(cacheInput)).cache.count, 200);
  assert.equal((await api.refreshVkCache(cacheInput)).code, 'server-required');
  assert.equal((await api.exportVkCache(cacheInput)).code, 'server-required');
  assert.equal(f.calls.length, before);
  assertVkTranslations(
    'vkCache',
    [
      'title',
      'hint',
      'accountId',
      'peerId',
      'kind',
      'maxPages',
      'history',
      'conversation',
      'friends',
      'profile',
      'friend-count',
      'inspect',
      'refresh',
      'restart',
      'empty',
      'coverage',
      'stale',
      'cached',
      'records',
      'first',
      'next',
      'folder',
      'exportHint',
      'export',
      'exported',
      'failed',
      'server-required',
      'working',
    ],
    { complete: true }
  );
});
test('foreground CLI shares bounded cache state and always closes its owned store', async () => {
  const f = cacheFixture();
  let closes = 0;
  f.store.close = async () => {
    closes++;
  };
  const commands = createVkCacheCommands({
    openStore: async () => f.store,
    create: () => f.service,
  });
  const output = [];
  const log = (text) => output.push(JSON.parse(text));
  const input = { account: 1, peer: 42, 'max-pages': 1 };
  assert.equal(
    await commands['vk-cache']({ ...input, _: ['refresh'] }, log),
    0
  );
  assert.equal(output.at(-1).cache.count, 200);
  const before = f.calls.length;
  assert.equal(
    await commands['vk-cache']({ ...input, _: ['inspect'] }, log),
    0
  );
  assert.equal(f.calls.length, before);
  assert.equal(
    await commands['vk-cache'](
      { ...input, _: ['refresh'], restart: 'yes' },
      log
    ),
    1
  );
  assert.equal(
    await commands['vk-cache'](
      { ...input, _: ['inspect'], 'page-offset': 1 },
      log
    ),
    1
  );
  assert.equal(output.at(-1).code, 'incomplete');
  assert.equal(closes, 3);
});

test(
  'server shutdown drains an admitted cache refresh before closing its owned fixture',
  { timeout: 15000 },
  async () => {
    const f = await cacheServer();
    let release;
    let entered;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    f.hook(async (method) => {
      if (method === 'messages.getHistory') {
        entered();
        await held;
      }
    });
    const post = createWirePost(f.base, '/api/vk/cache', LINO_TEXT);
    // Ordinary server close disconnects HTTP sockets immediately. Cache work
    // still owns its provider promise and must finish before store release.
    const request = post('/refresh', cacheInput).catch(() => null);
    let closing;
    try {
      await started;
      let closed = false;
      closing = f.close().then(() => {
        closed = true;
      });
      assert.equal(
        await Promise.race([
          closing.then(() => true),
          delay(100).then(() => false),
        ]),
        false
      );
      assert.equal(closed, false);
      release();
      await request;
      await closing;
      assert.equal((await f.service.inspect(cacheInput)).cache.count, 200);
      assert.equal(closed, true);
      assert.equal(f.stats().messages, 0);
    } finally {
      release();
      await request;
      await (closing ?? f.close());
    }
  }
);
