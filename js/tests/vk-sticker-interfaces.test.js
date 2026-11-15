import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createVkStickerCommands } from '../src/cli/vk-sticker-commands.js';
import { createVkStickerApi } from '../src/web/vk-sticker-api.js';
import { createVkStickerRuntime } from '../src/server/vk-sticker-runtime.js';
import { createWirePost } from './helpers/http-wire.mjs';
import { assertVkReadShutdown } from './helpers/vk-read-lifecycle.mjs';
import { assertVkTranslations } from './helpers/vk-policy-interfaces.mjs';
import {
  stickerFixture,
  stickerServer,
  stickerInput,
} from '../../experiments/issue-56/vk-stickers-fixture.mjs';

test(
  'server shutdown drains its admitted sticker catalog before releasing the fixture',
  { timeout: 15000 },
  async () => {
    await assertVkReadShutdown(
      await stickerServer(),
      'stickers',
      stickerInput,
      'store.getProducts',
      (out) => {
        assert.equal(out.catalog.stickers, 107);
      }
    );
  }
);

test(
  'trusted Lino text and binary routes expose catalog inspection, refresh, filtering and export',
  { timeout: 15000 },
  async () => {
    const f = await stickerServer();
    try {
      for (const [index, encoding] of [LINO_TEXT, LINO_BINARY].entries()) {
        const post = createWirePost(f.base, '/api/vk/stickers', encoding);
        assert.equal(
          (await post('/refresh', stickerInput, 'https://untrusted.example'))
            .status,
          403
        );
        assert.deepEqual(
          (await post('/refresh', stickerInput)).answer.catalog.greetingIds,
          ['101', '102']
        );
        const calls = f.calls.length;
        assert.equal(
          (await post('/inspect', { ...stickerInput, category: 'greeting' }))
            .answer.items.length,
          2
        );
        assert.deepEqual(
          (await post('/filter', { attachments: { 101: { productId: 11 } } }))
            .answer.products,
          [11]
        );
        const exported = await post('/export', {
          ...stickerInput,
          folder: path.join(f.folder, `wire-${index}`),
        });
        assert.equal(exported.answer.artworkDownloaded, false);
        assert.equal(f.calls.length, calls);
        assert.equal(
          (await post('/refresh', { accountId: 2 })).answer.ok,
          false
        );
      }
      assert.equal(f.stats().messages, 0);
    } finally {
      await f.close();
    }
  }
);
test('offline catalog and received filtering share the saved account snapshot in all four locales', async () => {
  const f = stickerFixture();
  await f.service.refresh(stickerInput);
  const calls = f.calls.length;
  const api = createVkStickerApi({
    report: async () => null,
    local: async () => f.store,
  });
  assert.equal((await api.inspectVkStickers(stickerInput)).offline, true);
  assert.equal(
    (await api.refreshVkStickers(stickerInput)).code,
    'server-required'
  );
  assert.equal(
    (await api.exportVkStickers(stickerInput)).code,
    'server-required'
  );
  assert.deepEqual(
    api.filterVkStickers({ attachments: { 101: { productId: 11 } } }).products,
    [11]
  );
  assert.equal(f.calls.length, calls);
  assertVkTranslations(
    'vkStickers',
    [
      'title',
      'hint',
      'accountId',
      'q',
      'packId',
      'all',
      'usableOnly',
      'inspect',
      'refresh',
      'empty',
      'count',
      'snapshot',
      'greetingIds',
      'matched',
      'usable',
      'unavailable',
      'choose',
      'first',
      'next',
      'folder',
      'received',
      'receivedHint',
      'filtered',
      'filter',
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
test('foreground CLI uses acknowledged catalogs and owns only its opened store', async () => {
  const f = await stickerServer();
  let closed = 0;
  const store = {
    ...f.store,
    close: async () => {
      closed++;
    },
  };
  const commands = createVkStickerCommands({
    openStore: async () => store,
    create: () => f.service,
  });
  const answers = [];
  const execute = (action, rest = {}) =>
    commands['vk-stickers']({ account: 1, _: [action], ...rest }, (line) =>
      answers.push(JSON.parse(line))
    );
  try {
    assert.equal(await execute('refresh'), 0);
    assert.equal(answers.at(-1).catalog.usable, 103);
    const calls = f.calls.length;
    assert.equal(await execute('inspect', { category: 'greeting' }), 0);
    assert.equal(answers.at(-1).items.length, 2);
    const file = path.join(f.folder, 'received.json');
    await writeFile(file, JSON.stringify({ 101: { productId: 11 } }));
    assert.equal(await execute('filter', { file }), 0);
    assert.deepEqual(answers.at(-1).products, [11]);
    assert.equal(
      await execute('export', { folder: path.join(f.folder, 'cli') }),
      0
    );
    assert.equal(await execute('inspect', { 'usable-only': 'yes' }), 1);
    assert.equal(closed, 3);
    assert.equal(f.calls.length, calls);
  } finally {
    await f.close();
  }
});
test('catalog runtime refuses new work and drains admitted provider reads before store release', async () => {
  const f = stickerFixture();
  const runtime = createVkStickerRuntime({ store: f.store, ...f.options });
  let release;
  let entered;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  f.hook(async (method) => {
    if (method === 'store.getProducts') {
      entered();
      await held;
    }
  });
  const task = runtime.run('refresh', stickerInput);
  await started;
  let closed = false;
  const closing = runtime.close().then(() => {
    closed = true;
  });
  try {
    await Promise.resolve();
    assert.equal(closed, false);
    assert.throws(() => runtime.run('inspect', stickerInput), /closing/u);
  } finally {
    release();
    await task;
    await closing;
  }
  assert.equal(closed, true);
  assert.equal((await f.service.inspect(stickerInput)).catalog.stickers, 107);
});
