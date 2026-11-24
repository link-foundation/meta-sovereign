import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGreetingCatalogModel } from '../src/web/telegram-greeting-catalog-model.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const fixture = (t) => {
  const calls = [];
  const api = {
    telegramStatus: async () => ({
      kind: 'user',
      capabilities: { greetingStickersRefresh: true },
    }),
    telegramGreetingStickersStatus: async (page) => {
      calls.push(['read', page]);
      return {
        ok: true,
        cache: { total: 4 },
        stickers: [],
        offset: page.offset,
      };
    },
    telegramGreetingStickersRefresh: async (options) => {
      calls.push(['refresh', options]);
      return { ok: true };
    },
    telegramGreetingStickersCancel: async () => {
      calls.push(['cancel']);
      return { ok: true };
    },
  };
  const model = createGreetingCatalogModel(api);
  t.after(model.stop);
  return { api, calls, model };
};

test('opening and reloading a supported catalog only reads its cache', async (t) => {
  const { model, calls } = fixture(t);
  await model.start();
  await model.load();
  assert.equal(model.state.availability, 'ready');
  assert.equal(model.state.data.cache.total, 4);
  assert.deepEqual(
    calls.map(([name]) => name),
    ['read', 'read']
  );
  assert.deepEqual(calls[0][1], { offset: 0, limit: 100, greetingsOnly: true });
});

test('unsupported accounts, missing methods and absent capabilities make no catalog request', async (t) => {
  for (const status of [
    { kind: 'bot', capabilities: { greetingStickersRefresh: true } },
    { kind: 'user', capabilities: {} },
  ]) {
    const { api, model, calls } = fixture(t);
    api.telegramStatus = async () => status;
    await model.start();
    assert.equal(model.state.availability, 'unavailable');
    assert.equal(model.state.data, null);
    assert.equal(calls.length, 0);
    model.stop();
  }
  const { api, model, calls } = fixture(t);
  delete api.telegramGreetingStickersCancel;
  await model.start();
  assert.equal(model.state.availability, 'unavailable');
  assert.equal(calls.length, 0);
});

test('refresh is explicit and overlapping refreshes are blocked until the cache read finishes', async (t) => {
  const { api, model, calls } = fixture(t);
  await model.start();
  const wait = deferred();
  api.telegramGreetingStickersRefresh = async (options) => {
    calls.push(['refresh', options]);
    return wait.promise;
  };
  const refreshing = model.refresh({ maxSets: 2, maxDocuments: 5 });
  assert.equal(model.state.busy, true);
  assert.equal(model.state.data.cache.total, 4);
  assert.equal(await model.refresh({}), false);
  assert.equal(await model.read({ offset: 100 }), false);
  wait.resolve({ ok: true });
  assert.equal(await refreshing, true);
  assert.equal(model.state.busy, false);
  assert.deepEqual(
    calls.map(([name]) => name),
    ['read', 'refresh', 'read']
  );
  await model.cancel();
  assert.deepEqual(
    calls.slice(-2).map(([name]) => name),
    ['cancel', 'read']
  );
});

test('failed page/filter/refresh reads retain cached results and the last successful page', async (t) => {
  const { api, model } = fixture(t);
  await model.start();
  await model.read({ offset: 100, greetingsOnly: false });
  const kept = model.state.data;
  api.telegramGreetingStickersStatus = async () => {
    throw new Error('disconnected');
  };
  assert.equal(await model.read({ offset: 200, greetingsOnly: true }), false);
  assert.equal(model.state.data, kept);
  assert.equal(model.state.offset, 100);
  assert.equal(model.state.greetingsOnly, false);
  assert.equal(model.state.error, 'offline');
  api.telegramGreetingStickersRefresh = async () => ({
    ok: false,
    code: 'busy',
  });
  assert.equal(await model.refresh({}), false);
  assert.equal(model.state.error, 'busy');
  assert.equal(model.state.data, kept);
});

test('unmounted requests cannot overwrite a restarted catalog or release its busy lock', async (t) => {
  const { api, model } = fixture(t);
  const old = deferred();
  api.telegramStatus = () => old.promise;
  const prior = model.start();
  model.stop();
  const current = deferred();
  api.telegramStatus = () => current.promise;
  const restarted = model.start();
  old.resolve({ kind: 'bot' });
  assert.equal(await prior, false);
  assert.equal(model.state.busy, true);
  current.resolve({
    kind: 'user',
    capabilities: { greetingStickersRefresh: true },
  });
  assert.equal(await restarted, true);
  assert.equal(model.state.availability, 'ready');
  assert.equal(model.state.busy, false);
});

test('losing the account capability clears its cached presentation', async (t) => {
  const { api, model } = fixture(t);
  await model.start();
  api.telegramStatus = async () => ({ kind: 'user', capabilities: {} });
  await model.load();
  assert.equal(model.state.data, null);
  assert.equal(model.state.availability, 'unavailable');
});
