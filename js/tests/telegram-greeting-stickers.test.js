import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  greetingStickerFixture,
  greetingDocument,
  greetingSet,
  refreshedCatalog,
} from './helpers/greeting-stickers-fakes.mjs';
import {
  GREETING_STICKER_CACHE,
  cacheSticker,
  restoreSticker,
  stickerRefreshOptions,
  stickerPageOptions,
} from '../src/sources/telegram-greeting-stickers-shape.js';
import { CHAT_USERS_POSTS } from '../src/server/routes-telegram-chat-users.js';
import { TELEGRAM_CALLS } from '../src/web/dom-telegram-calls.js';

test('discovers featured, mask sets, recent and favourite documents without any sends', async () => {
  const fixture = greetingStickerFixture();
  const result = await refreshedCatalog(fixture);
  assert.equal(result.job.state, 'done');
  assert.equal(result.cache.total, 4);
  assert.equal(result.cache.greetings, 4);
  assert.deepEqual(
    fixture.calls
      .filter((call) => call.className === 'GetStickerSet')
      .map((call) => String(call.stickerset.id)),
    ['11', '22']
  );
  assert.equal(
    fixture.calls.some((call) => call.className === 'SendMedia'),
    false
  );
  assert.ok(
    Object.values(result.cache.coverage).every((part) => part.complete)
  );
  assert.equal(
    result.stickers.some(
      (item) => 'accessHash' in item || 'fileReference' in item
    ),
    false
  );
  const saved = await fixture.store.get(`${GREETING_STICKER_CACHE}:1`);
  assert.equal(saved.documents.length, 4);
  assert.equal(typeof saved.documents[0].id, 'string');
  assert.equal(typeof saved.documents[0].fileReference, 'string');
});

test('pages featured sets, deduplicates documents and filters greeting alternatives', async () => {
  const fixture = greetingStickerFixture({
    invoke: async (request) => {
      switch (request.className) {
        case 'GetOldFeaturedStickers':
          return {
            sets:
              request.offset === 0
                ? Array.from({ length: 100 }, () => ({ set: greetingSet(11) }))
                : [{ set: greetingSet(22) }],
          };
        case 'GetStickerSet':
          return {
            documents: [
              greetingDocument(Number(request.stickerset.id), 'Hello!'),
            ],
          };
        case 'GetMaskStickers':
          return { sets: [greetingSet(22)] };
        default:
          return {
            stickers: [
              greetingDocument(11, '👋'),
              greetingDocument(33, 'this'),
              greetingDocument(44, 'HI'),
            ],
          };
      }
    },
  });
  const result = await refreshedCatalog(fixture);
  assert.equal(result.cache.total, 4);
  assert.equal(result.cache.greetings, 3);
  assert.deepEqual(
    fixture.calls
      .filter((call) => call.className === 'GetOldFeaturedStickers')
      .map((call) => call.offset),
    [0, 100]
  );
  assert.equal(
    fixture.calls.filter((call) => call.className === 'GetStickerSet').length,
    2
  );
  const page = await fixture.catalog.greetingStickersStatus({ limit: 1 });
  assert.equal(page.stickers.length, 1);
  assert.equal(page.more, true);
  const all = await fixture.catalog.greetingStickersStatus({
    greetingsOnly: false,
  });
  assert.equal(all.stickers.length, 4);
  assert.equal(await fixture.catalog.select(fixture.c, '33'), null);
  assert.equal((await fixture.catalog.select(fixture.c, '44')).id, '44');
});

test('cached documents survive account restarts, with isolated identities and expiry', async () => {
  let clock = 1_000_000;
  const fixture = greetingStickerFixture({ now: () => clock });
  await refreshedCatalog(fixture);
  clock += 600_001;
  const restarted = greetingStickerFixture({
    store: fixture.store,
    now: () => clock,
  });
  const result = await restarted.catalog.greetingStickersStatus();
  assert.equal(result.cache.total, 4);
  assert.equal(result.cache.stale, true);
  assert.equal(restarted.calls.length, 0);
  await restarted.catalog.select(restarted.c, '11');
  assert.equal(
    (
      await restarted.sendDocument({
        chat: '9',
        id: '11',
        clientId: 'cached-send',
      })
    ).messageId,
    '1'
  );
  restarted.setOwner('2');
  assert.equal(
    (await restarted.catalog.greetingStickersStatus()).cache.total,
    0
  );
  assert.equal(await restarted.catalog.select(restarted.c, '11'), null);
});

test('failed refresh preserves the previous cache and does not claim complete coverage', async () => {
  const fixture = greetingStickerFixture();
  const before = await refreshedCatalog(fixture);
  fixture.client.invoke = async () => {
    throw Object.assign(new Error('redacted'), { errorMessage: 'RPC_FAILED' });
  };
  const after = await refreshedCatalog(fixture);
  assert.equal(after.job.state, 'failed');
  assert.equal(after.cache.total, before.cache.total);
  assert.equal(after.cache.updatedAt, before.cache.updatedAt);
  assert.ok(
    Object.values(after.job.coverage).every(
      (part) => part.error === 'RPC_FAILED' && !part.complete
    )
  );
});

test('malformed Telegram lists remain incomplete rather than replacing a valid cache', async () => {
  const fixture = greetingStickerFixture();
  const before = await refreshedCatalog(fixture);
  fixture.client.invoke = async () => ({});
  const after = await refreshedCatalog(fixture);
  assert.equal(after.job.state, 'failed');
  assert.equal(after.cache.total, before.cache.total);
  assert.ok(Object.values(after.job.coverage).every((part) => !part.complete));
});

test('startup persistence failure releases the busy state before any provider read', async () => {
  const fixture = greetingStickerFixture();
  const put = fixture.store.put;
  fixture.store.put = async () => {
    throw new Error('disk unavailable');
  };
  const failed = await fixture.catalog.greetingStickersRefresh();
  assert.equal(failed.code, 'store-unavailable');
  assert.equal(fixture.calls.length, 0);
  fixture.store.put = put;
  assert.equal((await refreshedCatalog(fixture)).job.state, 'done');
});

test('shutdown owns an in-flight connection before a refresh job exists', async () => {
  const fixture = greetingStickerFixture();
  let release;
  fixture.client.getMe = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const starting = fixture.catalog.greetingStickersRefresh();
  for (let i = 0; i < 1000 && !release; i += 1) {
    await new Promise((resolve) => globalThis.setImmediate(resolve));
  }
  assert.equal(typeof release, 'function');
  let stopped = false;
  const stopping = fixture.env.greetingStickersStop().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => globalThis.setImmediate(resolve));
  assert.equal(stopped, false);
  release({ className: 'User', id: 1n });
  assert.equal((await starting).code, 'stopped');
  await stopping;
  assert.equal(fixture.calls.length, 0);
});

test('partial reads merge usable documents and expose server and local limits', async () => {
  const fixture = greetingStickerFixture();
  await refreshedCatalog(fixture);
  const original = fixture.client.invoke;
  fixture.client.invoke = (request) =>
    request.className === 'GetRecentStickers'
      ? Promise.resolve({ stickers: [greetingDocument(55)] })
      : original(request);
  const result = await refreshedCatalog(fixture, {
    maxSets: 1,
    maxDocuments: 3,
  });
  assert.equal(result.job.state, 'partial');
  assert.equal(result.job.limited, true);
  assert.ok(result.stickers.some((item) => item.id === '22'));
  assert.ok(result.stickers.some((item) => item.id === '55'));
});

test('stalled featured pagination stops with partial coverage', async () => {
  const fixture = greetingStickerFixture();
  const original = fixture.client.invoke;
  fixture.client.invoke = (request) =>
    request.className === 'GetOldFeaturedStickers'
      ? Promise.resolve({
          sets: Array.from({ length: 100 }, () => ({ set: greetingSet(11) })),
        })
      : original(request);
  const result = await refreshedCatalog(fixture);
  assert.equal(result.job.state, 'partial');
  assert.equal(result.job.coverage.featured.error, 'pagination-stalled');
  assert.equal(
    fixture.calls.filter((call) => call.className === 'GetStickerSet').length,
    2
  );
});

test('cancellation waits for the active read and preserves the prior cache', async () => {
  const fixture = greetingStickerFixture();
  const previous = await refreshedCatalog(fixture);
  let release;
  fixture.client.invoke = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  await fixture.catalog.greetingStickersRefresh();
  assert.equal((await fixture.catalog.greetingStickersRefresh()).code, 'busy');
  await fixture.catalog.greetingStickersCancel();
  let stopped = false;
  const stopping = fixture.env.greetingStickersStop().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => globalThis.setImmediate(resolve));
  assert.equal(stopped, false);
  release({ sets: [] });
  await stopping;
  const result = await fixture.catalog.greetingStickersStatus();
  assert.equal(result.job.state, 'cancelled');
  assert.equal(result.cache.updatedAt, previous.cache.updatedAt);
  assert.equal(
    (await fixture.catalog.greetingStickersRefresh()).code,
    'stopped'
  );
});

test('account changes before cache commit discard the refresh', async () => {
  const fixture = greetingStickerFixture();
  const original = fixture.client.invoke;
  fixture.client.invoke = async (request) => {
    const answer = await original(request);
    if (request.className === 'GetFavedStickers') {
      fixture.setOwner('2');
    }
    return answer;
  };
  const started = await fixture.catalog.greetingStickersRefresh();
  let job;
  for (let i = 0; i < 1000; i += 1) {
    job = await fixture.store.get(
      `telegram-greeting-stickers-job:${started.job.id}`
    );
    if (job.state === 'failed') {
      break;
    }
    await new Promise((resolve) => globalThis.setImmediate(resolve));
  }
  assert.equal(job.code, 'account-changed');
  await fixture.env.greetingStickersStop();
  assert.equal(await fixture.store.get(`${GREETING_STICKER_CACHE}:1`), null);
  assert.equal((await fixture.catalog.greetingStickersStatus()).job, null);
});

test('expired sticker references refresh from the original mask set before a confirmed send', async () => {
  const fixture = greetingStickerFixture();
  await refreshedCatalog(fixture);
  await fixture.catalog.select(fixture.c, '22');
  const original = fixture.client.invoke;
  let expired = true;
  fixture.client.invoke = async (request) => {
    if (request.className === 'SendMedia' && expired) {
      expired = false;
      throw Object.assign(new Error('expired'), {
        errorMessage: 'FILE_REFERENCE_EXPIRED',
      });
    }
    if (request.className === 'GetStickerSet') {
      return { documents: [greetingDocument(22, '👋', 2)] };
    }
    if (request.className === 'SendMedia') {
      assert.deepEqual(request.media.id.fileReference, Buffer.from([2]));
    }
    return original(request);
  };
  const sent = await fixture.sendDocument({
    chat: '9',
    id: '22',
    clientId: 'refresh-ref',
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.messageId, '1');
});

test('cache validation rejects unusable documents and bounded route inputs', async () => {
  assert.equal(
    cacheSticker(greetingDocument(1, 'this'), { kind: 'recent' }).greeting,
    false
  );
  for (const patch of [
    { fileReference: Buffer.alloc(0) },
    { fileReference: Buffer.alloc(1025) },
    { id: 'wrong' },
    { attributes: [] },
    { className: 'DocumentEmpty' },
  ]) {
    assert.equal(
      cacheSticker({ ...greetingDocument(1), ...patch }, { kind: 'recent' }),
      null
    );
  }
  const item = cacheSticker(greetingDocument(1), { kind: 'recent' });
  for (const patch of [
    { fileReference: '<html>' },
    { emoji: 'x'.repeat(129) },
    { origin: { kind: 'unknown' } },
    { size: Infinity },
  ]) {
    assert.equal(restoreSticker({ ...item, ...patch }), null);
  }
  assert.equal(stickerRefreshOptions({ maxSets: 0 }), null);
  assert.equal(stickerPageOptions({ greetingsOnly: 'true' }), null);
  const bad = await CHAT_USERS_POSTS['greeting-stickers-refresh'](
    {},
    { maxDocuments: 50_001 }
  );
  assert.equal(bad[0], 400);
  assert.equal(
    (await CHAT_USERS_POSTS['greeting-stickers-status']({}, {}))[0],
    501
  );
  assert.equal(
    TELEGRAM_CALLS.telegramGreetingStickersRefresh.capability,
    'greetingStickersRefresh'
  );
  assert.equal(
    TELEGRAM_CALLS.telegramGreetingStickersStatus.capability,
    'greetingStickersRefresh'
  );
});
