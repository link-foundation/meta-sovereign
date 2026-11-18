import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVkOutgoingQueue } from '../src/automation/vk-outgoing-queue.js';
import { loadVkSendQueue } from '../src/automation/vk-queue-inspection.js';
import {
  saveVkOutgoingSettings,
  readVkOutgoingSettings,
} from '../src/automation/vk-outgoing-settings.js';
import { queueFixture } from '../../experiments/issue-56/vk-queue-fixture.mjs';

test('text preserves 2-second read, repeated 5-second typing and 450-cpm send timing', async (t) => {
  const f = queueFixture();
  t.after(() => f.queue.close());
  await f.enable();
  const start = f.now();
  assert.equal((await f.submit('text')).status, 'sent');
  assert.equal(f.calls[0].method, 'messages.markAsRead');
  assert.equal(f.calls[0].start_message_id, '21');
  assert.deepEqual(
    f.calls
      .filter((c) => c.method === 'messages.setActivity')
      .map((c) => c.at - start),
    Array.from({ length: 13 }, (_, i) => 6000 + 5000 * i)
  );
  assert.equal(f.calls[0].at - start, 2000);
  assert.equal(f.calls.at(-1).at - start, 70000);
  assert.equal(f.calls.at(-1).method, 'messages.send');
  assert.notEqual(f.calls.at(-1).random_id, '0');
  const out = await loadVkSendQueue(f.store);
  assert.equal(out.items[0].read, 'confirmed');
  assert.equal(out.items[0].typing, 'confirmed');
  assert.equal(out.items[0].delivery, 'sent');
});
test('sticker has a separate six-second delay and never emits typing', async (t) => {
  const f = queueFixture();
  t.after(() => f.queue.close());
  await f.enable();
  const start = f.now();
  await f.submit('sticker', {
    source: 'vk',
    chat: '8',
    sticker: { id: '101' },
  });
  assert.deepEqual(
    f.calls.map((c) => c.method),
    ['messages.markAsRead', 'messages.send']
  );
  assert.equal(f.calls[1].at - start, 6000);
  assert.equal(f.calls[1].sticker_id, '101');
});
test('disabled pacing preserves immediate send and emits no read or typing', async (t) => {
  const f = queueFixture();
  t.after(() => f.queue.close());
  await f.submit('immediate');
  assert.deepEqual(
    f.calls.map((c) => c.method),
    ['messages.send']
  );
  assert.deepEqual(f.sleeps, []);
});
test(
  'two peers get FIFO execution and their own completion; refusal does not poison later work',
  { timeout: 10000 },
  async (t) => {
    const f = queueFixture();
    const gate = Promise.withResolvers();
    const entered = Promise.withResolvers();
    t.after(() => {
      gate.resolve();
      return f.queue.close();
    });
    const first = f.queue.run({ key: 'first', draft: {} }, async () => {
      entered.resolve();
      await gate.promise;
      throw new Error('definitive refusal');
    });
    const rejected = assert.rejects(first, /definitive refusal/);
    let secondRan = false;
    const second = f.queue.run(
      { key: 'second', draft: { chat: '8' } },
      async () => {
        secondRan = true;
        return 29;
      }
    );
    await entered.promise;
    assert.equal(f.queue.inspect().waiting, 1);
    await turn();
    assert.equal(secondRan, false);
    gate.resolve();
    await rejected;
    assert.equal(await second, 29);
    assert.equal(f.queue.inspect().waiting, 0);
  }
);
test(
  'settings saved while another RPC is held invalidate already waiting work',
  { timeout: 10000 },
  async () => {
    for (const enabled of [false, true]) {
      const f = queueFixture();
      const entered = Promise.withResolvers();
      const release = Promise.withResolvers();
      if (enabled) {
        await f.enable();
      }
      const first = f.queue.run({ key: 'held', draft: {} }, async () => {
        entered.resolve();
        await release.promise;
        return { status: 'sent' };
      });
      await entered.promise;
      const waiting = f.submit('waiting');
      const refused = assert.rejects(waiting, { code: 'review-required' });
      try {
        await saveVkOutgoingSettings(f.store, { enabled: !enabled });
        release.resolve();
        await first;
        await refused;
        assert.equal(f.calls.length, 0);
      } finally {
        release.resolve();
        await f.queue.close();
      }
    }
  }
);
test('settings change during delay and during ready acknowledgement both block issue', async (t) => {
  for (const stage of ['sleep', 'ready']) {
    const f = queueFixture();
    t.after(() => f.queue.close());
    await f.enable();
    if (stage === 'sleep') {
      f.hook(async () => {
        await saveVkOutgoingSettings(f.store, { enabled: false });
      });
    } else {
      const put = f.store.put.bind(f.store);
      f.store.put = async (row) => {
        const out = await put(row);
        if (row.status === 'ready') {
          await saveVkOutgoingSettings(f.store, { enabled: false });
        }
        return out;
      };
    }
    await assert.rejects(f.submit(stage), { code: 'review-required' });
    assert.equal(f.calls.filter((c) => c.method === 'messages.send').length, 0);
  }
});
test(
  'queue close cancels delay and queued peers, and awaits an admitted provider call',
  { timeout: 10000 },
  async () => {
    const f = queueFixture();
    const entered = Promise.withResolvers();
    f.hook(
      (_ms, signal) =>
        new Promise((resolve) => {
          entered.resolve();
          signal.addEventListener('abort', resolve, { once: true });
        })
    );
    await f.enable();
    const requests = [f.submit('one'), f.submit('two')];
    const rejected = requests.map((r) =>
      assert.rejects(r, { code: 'stopped' })
    );
    await entered.promise;
    await f.queue.close();
    await Promise.all(rejected);
    assert.equal(f.calls.length, 0);
    await assert.rejects(f.submit('late'), { code: 'stopped' });
    const next = queueFixture();
    const release = Promise.withResolvers();
    const started = Promise.withResolvers();
    const running = next.queue.run({ key: 'rpc', draft: {} }, async () => {
      started.resolve();
      await release.promise;
      return 71;
    });
    try {
      await started.promise;
      let closed = false;
      const closing = next.queue.close().then(() => {
        closed = true;
      });
      await turn();
      assert.equal(closed, false);
      release.resolve();
      assert.equal(await running, 71);
      await closing;
    } finally {
      release.resolve();
      await next.queue.close();
    }
  }
);
test('failed intent or ready flush prevents provider send; failed result flush preserves outbox truth', async (t) => {
  for (const stage of ['pacing', 'ready', 'sent']) {
    const f = queueFixture();
    t.after(() => f.queue.close());
    await f.enable();
    const put = f.store.put.bind(f.store);
    let armed = true;
    f.store.put = async (row) => {
      if (armed && row.id.startsWith('vk-outgoing:') && row.status === stage) {
        armed = false;
        await put(row);
        throw new Error('Synthetic acknowledgement refusal');
      }
      return put(row);
    };
    await assert.rejects(f.submit(stage), /acknowledgement refusal/);
    const sends = f.calls.filter((c) => c.method === 'messages.send');
    assert.equal(sends.length, stage === 'sent' ? 1 : 0);
    if (stage === 'sent') {
      assert.equal((await f.store.get('outbox:sent')).status, 'sent');
      assert.equal((await loadVkSendQueue(f.store)).items[0].status, 'unknown');
    }
  }
});
test('strict read and typing results retain unconfirmed/refused state without claiming confirmation', async (t) => {
  const f = queueFixture();
  t.after(() => f.queue.close());
  await f.enable();
  await f.queue.run(
    {
      key: 'indications',
      draft: { chat: '7', text: 'hi' },
      markRead: async () => 0,
      setTyping: async () => {
        throw new Error('Refused');
      },
    },
    async () => ({ status: 'unknown' })
  );
  const item = (await loadVkSendQueue(f.store)).items[0];
  assert.equal(item.read, 'unconfirmed');
  assert.equal(item.typing, 'refused');
  assert.equal(item.status, 'unknown');
  assert.equal(item.delivery, 'not-started');
});
test('unknown and sent outbox receipts survive causal restart and prevent every indication and resend', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vk-queue-reopen-'));
  let store;
  try {
    const file = path.join(dir, 'links.lino');
    store = withCausalWrites(await createLinoTextStore(file));
    const f = queueFixture({ store });
    await f.enable();
    await f.submit('sent');
    await store.put({ id: 'outbox:unknown', status: 'unknown' });
    await store.flush();
    await f.queue.close();
    await store.close();
    store = withCausalWrites(await createLinoTextStore(file));
    const reopened = queueFixture({ store });
    for (const key of ['sent', 'unknown']) {
      assert.equal((await reopened.submit(key)).status, 'failed');
    }
    assert.equal(reopened.calls.length, 0);
    assert.equal(reopened.sleeps.length, 0);
    assert.equal((await readVkOutgoingSettings(store)).enabled, true);
    await reopened.queue.close();
  } finally {
    await store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test('bounded queue admission refuses the 101st waiter and oversized payloads', async () => {
  const store = createMemoryStore();
  const q = createVkOutgoingQueue({ store });
  const gate = Promise.withResolvers();
  const entered = Promise.withResolvers();
  const results = Array.from({ length: 100 }, (_, i) =>
    q.run({ key: String(i), draft: {} }, async () => {
      entered.resolve();
      await gate.promise;
    })
  );
  const settled = Promise.allSettled(results);
  try {
    await entered.promise;
    await assert.rejects(
      q.run({ key: 'full', draft: {} }, () => {}),
      { code: 'queue-full' }
    );
  } finally {
    gate.resolve();
    await settled;
    await q.close();
  }
  const fresh = createVkOutgoingQueue({ store });
  await assert.rejects(
    fresh.run({ key: 'large', draft: { text: 'x'.repeat(12001) } }, () => {})
  );
  await fresh.close();
});
