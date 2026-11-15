import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setImmediate as turn } from 'node:timers/promises';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { createAutomationScheduler } from '../src/automation/runner.js';
import { peerTriggerId } from '../src/automation/trigger-state.js';

const NOW = Date.parse('2026-11-15T00:00:00Z');
const clock = () => new Date(NOW);
const message = (id = '1', chat = '7', offset = 0) => ({
  id: `msg:vk:${id}`,
  source: 'vk',
  chat,
  sender: chat,
  body: 'hello',
  timestamp: new Date(NOW + offset).toISOString(),
});
const automation = (id = 'peer') =>
  normalizeAutomation({
    id,
    triggers: [{ kind: 'incoming', pattern: 'hello' }],
  });
const fixture = async (t, { store = createMemoryStore(), run } = {}) => {
  const a = automation();
  await store.put(a);
  const calls = [];
  const errors = [];
  const scheduler = createAutomationScheduler({
    store,
    clock,
    log: (row) => errors.push(row),
    runner: {
      run: async (...args) => {
        calls.push(args);
        return run ? run(...args) : { queued: ['reviewed-draft'] };
      },
    },
  });
  t.after(() => scheduler.stop());
  return { a, store, scheduler, calls, errors };
};

test('duplicate concurrent live updates admit one durable peer trigger', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.scheduler.onMessage(message()))
  );
  assert.equal(results.flat().length, 1);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0][1], {
    trigger: 'incoming',
    targets: [{ source: 'vk', chat: '7' }],
  });
  const state = await f.store.get(peerTriggerId(f.a, message()));
  assert.equal(state.lastTriggered, clock().toISOString());
  assert.equal(state.status, 'processed');
  assert.equal(state.drafts, 1);
  assert.deepEqual(state.messageIds, ['msg:vk:1']);
  assert.equal(state.chat, '7');
});

test('two schedulers sharing a store serialize peer admission', async (t) => {
  const first = await fixture(t);
  const second = await fixture(t, { store: first.store });
  await Promise.all([
    first.scheduler.onMessage(message()),
    second.scheduler.onMessage(message()),
  ]);
  assert.equal(first.calls.length + second.calls.length, 1);
});

test('peer state distinguishes identities, equal-time IDs and rejects older updates', async (t) => {
  const f = await fixture(t);
  for (const m of [
    message(),
    message('2'),
    message('1', '8'),
    { ...message(), source: 'hh' },
  ]) {
    assert.equal((await f.scheduler.onMessage(m)).length, 1);
  }
  await f.store.put(automation('other'));
  assert.equal((await f.scheduler.onMessage(message())).length, 1);
  assert.equal(
    (await f.scheduler.onMessage(message('3', '7', 1000))).length,
    2
  );
  assert.deepEqual(await f.scheduler.onMessage(message('late', '7', 500)), []);
  assert.equal(f.calls.length, 7);
  assert.notEqual(
    peerTriggerId(f.a, message('1', 'a:b')),
    peerTriggerId({ id: `${f.a.id}:a` }, message('1', 'b'))
  );
});

test('failed drafting or acknowledgement does not advance the peer receipt', async (t) => {
  let failRun = true;
  const f = await fixture(t, {
    run: async () => {
      if (failRun) {
        throw new Error('draft unavailable');
      }
      return { queued: [] };
    },
  });
  assert.deepEqual(await f.scheduler.onMessage(message()), []);
  assert.equal(await f.store.get(peerTriggerId(f.a, message())), null);
  failRun = false;
  await f.scheduler.onMessage(message());
  const saved = await f.store.get(peerTriggerId(f.a, message()));
  let failFlush = true;
  f.store.flush = async () => {
    if (failFlush) {
      failFlush = false;
      throw new Error('disk refusal');
    }
  };
  assert.deepEqual(await f.scheduler.onMessage(message('2', '7', 1)), []);
  assert.deepEqual(await f.store.get(saved.id), saved);
  assert.equal((await f.scheduler.onMessage(message('2', '7', 1))).length, 1);
  assert.equal(f.errors.length, 2);
});

test('causal text-store reopen retains peer admission without provider reads', async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'vk-peer-trigger-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const open = async () =>
    withCausalWrites(
      await createLinoTextStore(path.join(folder, 'state.lino'))
    );
  let store = await open();
  try {
    const first = await fixture(t, { store });
    await first.scheduler.onMessage(message());
    await first.scheduler.stop();
    await store.close();
    store = await open();
    const second = await fixture(t, { store });
    assert.deepEqual(await second.scheduler.onMessage(message()), []);
    assert.equal(second.calls.length, 0);
    assert.equal((await second.scheduler.onMessage(message('2'))).length, 1);
    assert.ok((await store.get(peerTriggerId(second.a, message()))).vc);
    await second.scheduler.stop();
  } finally {
    await store.close();
  }
});

test('stop drains admitted drafting and acknowledgement and refuses queued/new work', async (t) => {
  const admitted = Promise.withResolvers();
  const release = Promise.withResolvers();
  const f = await fixture(t, {
    run: async () => {
      admitted.resolve();
      await release.promise;
      return { queued: [] };
    },
  });
  const active = f.scheduler.onMessage(message());
  await admitted.promise;
  const queued = f.scheduler.onMessage(message('2', '8'));
  let closed = false;
  const closing = f.scheduler.stop().then(() => {
    closed = true;
  });
  await turn();
  assert.equal(closed, false);
  assert.deepEqual(await f.scheduler.onMessage(message('3')), []);
  release.resolve();
  assert.equal((await active).length, 1);
  await closing;
  assert.deepEqual(await queued, []);
  assert.equal(f.calls.length, 1);
  assert.equal(
    (await f.store.get(peerTriggerId(f.a, message()))).status,
    'processed'
  );
});

test('schedule failures retain their due time and concurrent ticks run once', async (t) => {
  let fail = true;
  const f = await fixture(t, {
    run: async () => {
      if (fail) {
        throw new Error('draft unavailable');
      }
      return { queued: [] };
    },
  });
  await f.store.put(
    normalizeAutomation({
      id: 'scheduled',
      triggers: [{ kind: 'schedule', every: '1h' }],
    })
  );
  assert.deepEqual(await f.scheduler.tick(), []);
  assert.equal(await f.store.get('automation-state:scheduled'), null);
  fail = false;
  assert.equal(
    (await Promise.all([f.scheduler.tick(), f.scheduler.tick()])).flat().length,
    1
  );
  assert.equal(
    (await f.store.get('automation-state:scheduled')).lastRunAt,
    clock().toISOString()
  );
});

test('invalid, outgoing, deleted and service updates never create peer state', async (t) => {
  const f = await fixture(t);
  for (const patch of [
    { id: '' },
    { timestamp: 'invalid' },
    { outgoing: true },
    { out: 1 },
    { sender: 'me' },
    { deleted: true },
    { service: true },
  ]) {
    assert.deepEqual(
      await f.scheduler.onMessage({ ...message(), ...patch }),
      []
    );
  }
  assert.equal(f.calls.length, 0);
});

test('saturated equal-time window refuses instead of forgetting prior IDs', async (t) => {
  const f = await fixture(t);
  await f.store.put({
    id: peerTriggerId(f.a, message()),
    messageTime: NOW,
    messageIds: Array.from({ length: 128 }, (_, n) => `msg:vk:${n}`),
  });
  assert.deepEqual(await f.scheduler.onMessage(message('129')), []);
  assert.equal(f.calls.length, 0);
  assert.match(f.errors[0].error, /Too many/u);
  assert.equal((await f.scheduler.onMessage(message('129', '7', 1))).length, 1);
});
