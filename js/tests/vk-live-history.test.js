import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVkInbox } from '../src/sources/vk-sync.js';
import { createAutomationScheduler } from '../src/automation/scheduler.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { loadPullState } from '../src/sources/pull-runner.js';
import { createDoubletsStore } from '../src/storage/doublets-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { withMessageVersions } from '../src/storage/message-versions.js';
import { storeSourceMessages } from '../src/sources/store-messages.js';
import {
  createFakeVk,
  userMethods,
  message,
  FAKE_VK_BASE,
} from './helpers/fake-vk.js';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const nativeMessage = (id, peer = 7, text = 'hello') =>
  message(id, peer, text, { date: NOW / 1000 });
const fixture = async ({ store = createMemoryStore(), methods = {} } = {}) => {
  await store.put({
    id: 'secret:vk:access-token',
    token: 'fixture-live-token',
  });
  let update = nativeMessage(200);
  let ts = 100;
  const fake = createFakeVk({
    methods: userMethods({
      'messages.getById': () => ({ items: [update] }),
      'messages.getHistory': () => ({
        count: 150,
        items: Array.from({ length: 100 }, (_, i) =>
          nativeMessage(update.id - i, update.peer_id)
        ),
      }),
      ...methods,
    }),
    poll: () => ({
      ts: String(++ts),
      updates: [
        [4, update.id, 0, update.peer_id, update.date, update.text, {}],
      ],
    }),
  });
  const inbox = () =>
    createVkInbox({
      store,
      fetchImpl: fake.fetchImpl,
      baseUrl: FAKE_VK_BASE,
      sleep: async () => {},
      requestsPerSecond: 1000,
    });
  return {
    store,
    fake,
    inbox,
    update: (next) => {
      update = next;
    },
  };
};

test('first live trigger observes its newest 100 native messages without replaying historical triggers', async (t) => {
  const f = await fixture();
  await f.store.put(
    normalizeAutomation({
      id: 'native-context',
      triggers: [{ kind: 'incoming', pattern: 'hello' }],
    })
  );
  const observed = [];
  const errors = [];
  const scheduler = createAutomationScheduler({
    store: f.store,
    clock: () => new Date(NOW - 1000),
    log: (error) => errors.push(error),
    runner: {
      run: async () => {
        observed.push(
          (await f.store.query((row) => row.id.startsWith('msg:vk:'))).length
        );
        return { queued: ['reviewed'] };
      },
    },
  });
  t.after(() => scheduler.stop());
  scheduler.start();
  await f.inbox().step({ wait: 0 });
  await scheduler.stop();
  assert.deepEqual(observed, [100]);
  assert.deepEqual(
    errors.map(({ event }) => event),
    ['trigger_check', 'trigger_finished']
  );
  assert.ok(errors.every(({ level }) => level === 'debug'));
  assert.ok(Number.isFinite(errors[1].durationMs));
  const history = f.fake.calls.filter((c) => c.name === 'messages.getHistory');
  assert.equal(history.length, 1);
  assert.equal(history[0].params.count, '100');
  assert.equal(history[0].params.peer_id, '7');
  const receipt = await f.store.get('vk-live-history:1:7');
  assert.equal(receipt.loaded, 100);
  assert.equal(receipt.total, 150);
  assert.equal(receipt.complete, false);
});

test('live peer windows refresh once per client session, survive reopen and retain live edits', async () => {
  const f = await fixture();
  const inbox = f.inbox();
  await inbox.step({ wait: 0 });
  f.update({
    ...nativeMessage(200, 7, 'edited body'),
    update_time: NOW / 1000 + 1,
  });
  await inbox.step({ wait: 0 });
  assert.equal((await f.store.get('msg:vk:200')).body, 'edited body');
  assert.equal(
    f.fake.calls.filter((c) => c.name === 'messages.getHistory').length,
    1
  );
  f.update(nativeMessage(400, 9));
  await inbox.step({ wait: 0 });
  await f.inbox().step({ wait: 0 });
  assert.equal(
    f.fake.calls.filter((c) => c.name === 'messages.getHistory').length,
    3
  );
  assert.equal((await f.store.get('msg:vk:200')).body, 'edited body');
  assert.ok(await f.store.get('vk-live-history:1:9'));
});

test('failed or malformed native history holds the incoming event and cursor for a later read', async () => {
  for (const raw of [
    { error: { error_code: 15, error_msg: 'No history permission' } },
    { count: 1, items: [] },
    { count: 150, items: [nativeMessage(199)] },
    { count: 1, items: [nativeMessage(199, 8)] },
    { count: 1, items: [nativeMessage(0)] },
    { count: 2, items: [nativeMessage(199), nativeMessage(199)] },
    {
      count: 101,
      items: Array.from({ length: 101 }, (_, i) => nativeMessage(200 - i)),
    },
  ]) {
    let valid = false;
    const f = await fixture({
      methods: {
        'messages.getHistory': () =>
          valid ? { count: 1, items: [nativeMessage(200)] } : raw,
      },
    });
    const inbox = f.inbox();
    await assert.rejects(inbox.step({ wait: 0 }));
    assert.equal((await loadPullState(f.store, 'vk')).ts, undefined);
    assert.equal(await f.store.get('msg:vk:200'), null);
    assert.equal(await f.store.get('vk-live-history:1:7'), null);
    valid = true;
    await inbox.step({ wait: 0 });
    assert.equal((await loadPullState(f.store, 'vk')).ts, '102');
    assert.ok(await f.store.get('msg:vk:200'));
  }
});

test('a failed native-window acknowledgement cannot admit an event or become a cached success', async () => {
  const store = createMemoryStore();
  let reject = true;
  store.flush = async () => {
    if (reject) {
      throw new Error('Synthetic history flush failure');
    }
  };
  const f = await fixture({ store });
  const inbox = f.inbox();
  await assert.rejects(inbox.step({ wait: 0 }), /history flush/);
  assert.equal((await loadPullState(store, 'vk')).ts, undefined);
  assert.equal(await store.get('msg:vk:200'), null);
  assert.equal(await store.get('vk-live-history:1:7'), null);
  reject = false;
  await inbox.step({ wait: 0 });
  assert.equal(
    f.fake.calls.filter((c) => c.name === 'messages.getHistory').length,
    2
  );
  assert.equal((await loadPullState(store, 'vk')).ts, '102');
  assert.ok(await store.get('vk-live-history:1:7'));
});

test(
  'history inherits its requested peer, forwards transient metadata through durable wrappers and reopens cleanly',
  { timeout: 10000 },
  async () => {
    const { historicalMutation } = await import('../src/storage/mutation.js');
    const dir = await mkdtemp(join(tmpdir(), 'ms-vk-live-history-'));
    const path = join(dir, 'links');
    const open = async () =>
      withMessageVersions(
        withCausalWrites(await createDoubletsStore(path), {
          actor: 'history-fixture',
        })
      );
    let store;
    try {
      store = await open();
      const row = nativeMessage(199);
      delete row.peer_id;
      const f = await fixture({
        store,
        methods: {
          'messages.getHistory': () => ({ count: 1, items: [row] }),
        },
      });
      const events = [];
      const off = store.subscribe((event) => events.push(event));
      await f.inbox().step({ wait: 0 });
      off();
      assert.equal((await store.get('msg:vk:199')).chat, '7');
      assert.equal(
        events.find((e) => e.link.id === 'msg:vk:199')[historicalMutation],
        true
      );
      assert.equal(
        events.find((e) => e.link.id === 'msg:vk:200')[historicalMutation],
        undefined
      );
      const historical = await store.get('msg:vk:199');
      assert.deepEqual(Object.getOwnPropertySymbols(historical), []);
      await store.flush?.();
      await store.close?.();
      store = await open();
      assert.deepEqual(await store.get('msg:vk:199'), historical);
      assert.equal((await store.get('vk-live-history:1:7')).complete, true);
      const single = { ...store, putMany: undefined };
      const seen = [];
      const stop = store.subscribe((event) => seen.push(event));
      await storeSourceMessages(
        single,
        'vk',
        [{ ...historical, id: 'msg:vk:198' }],
        { [historicalMutation]: true }
      );
      stop();
      assert.equal(
        seen.find((e) => e.link.id === 'msg:vk:198')[historicalMutation],
        true
      );
    } finally {
      await store?.flush?.();
      await store?.close?.();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test(
  'credentials changed during a held history read reject the event, then identify the replacement and reset its cursor',
  { timeout: 10000 },
  async () => {
    const entered = deferred();
    const released = deferred();
    const f = await fixture({
      methods: {
        'users.get': (params) => [
          { id: params.access_token === 'replacement-fixture-token' ? 2 : 1 },
        ],
        'messages.getHistory': async () => {
          entered.resolve();
          await released.promise;
          return { count: 1, items: [nativeMessage(199)] };
        },
      },
    });
    const inbox = f.inbox();
    const step = inbox.step({ wait: 0 });
    const refused = assert.rejects(step, { code: 'vk-credential-changed' });
    await entered.promise;
    await f.store.put({
      id: 'secret:vk:access-token',
      token: 'replacement-fixture-token',
    });
    released.resolve();
    await refused;
    assert.equal(await f.store.get('msg:vk:199'), null);
    assert.equal(await f.store.get('msg:vk:200'), null);
    assert.equal((await loadPullState(f.store, 'vk')).ts, undefined);
    await f.store.put({
      ...(await loadPullState(f.store, 'vk')),
      ts: '999',
      backfill: { 7: 'done' },
    });
    await inbox.step({ wait: 0 });
    assert.equal((await loadPullState(f.store, 'vk')).selfId, 2);
    assert.deepEqual((await loadPullState(f.store, 'vk')).backfill, {});
    assert.deepEqual(
      f.fake.polls.map((p) => p.ts),
      ['100', '100']
    );
    assert.ok(await f.store.get('vk-live-history:2:7'));
    assert.equal(
      f.fake.calls.filter((c) => c.name === 'messages.getLongPollServer')
        .length,
      2
    );
  }
);

test(
  'stop drains a first peer window already in flight before the store can close',
  { timeout: 10000 },
  async () => {
    const entered = deferred();
    const released = deferred();
    const f = await fixture({
      methods: {
        'messages.getHistory': async () => {
          entered.resolve();
          await released.promise;
          return { count: 1, items: [nativeMessage(199)] };
        },
      },
    });
    const inbox = f.inbox();
    inbox.start();
    await entered.promise;
    let stopped = false;
    const stop = inbox.stop().then(() => {
      stopped = true;
    });
    try {
      await Promise.resolve();
      assert.equal(stopped, false);
    } finally {
      released.resolve();
      await stop;
    }
    assert.ok(await f.store.get('msg:vk:199'));
    assert.ok(await f.store.get('msg:vk:200'));
    assert.equal((await loadPullState(f.store, 'vk')).ts, '101');
    assert.equal(inbox.running, false);
  }
);
