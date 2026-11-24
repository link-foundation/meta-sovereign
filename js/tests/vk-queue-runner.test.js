import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture } from '../../experiments/issue-56/vk-queue-fixture.mjs';
import {
  seedGratitude,
  gratitudePreset,
} from '../../experiments/issue-56/vk-gratitude-fixture.mjs';
import { createAutomationRunner } from '../src/automation/runner.js';
import { queueVkPolicyMessage } from '../src/automation/vk-queued-delivery.js';
import { guardedSend } from '../src/automation/outbox.js';
import { saveSettings } from '../src/automation/safety.js';
import { loadVkSendQueue } from '../src/automation/vk-queue-inspection.js';
import {
  greetAdapter,
  withGreetJob,
  runGreet,
} from '../../experiments/issue-56/vk-greet-fixture.mjs';

const runnerFixture = async (t) => {
  const f = queueFixture();
  await seedGratitude(f.store);
  for (const message of await f.store.query((row) =>
    row.id.startsWith('msg:vk:')
  )) {
    await f.store.put({
      ...message,
      timestamp: new Date(f.now() - 60000).toISOString(),
    });
  }
  await f.enable();
  const runner = createAutomationRunner({
    store: f.store,
    clock: () => new Date(f.now()),
    sleep: f.sleep,
    send: async (draft) => ({
      via: 'api',
      result: await f.live.post(draft, f.options),
    }),
    markRead: (input) => f.live.markRead(input, f.options),
    setTyping: async (input) => ({
      supported: true,
      source: 'vk',
      result: await f.live.setTyping(input, f.options),
    }),
  });
  t.after(() => runner.close());
  const a = gratitudePreset();
  const run = await runner.run(a, { targets: [{ source: 'vk', chat: '41' }] });
  assert.equal(run.queued.length, 1);
  return { ...f, runner, draft: run.queued[0] };
};
test('reviewed reply reads its exact incoming ID, preserves the native sticker and skips typing', async (t) => {
  const f = await runnerFixture(t);
  assert.equal(f.calls.length, 0);
  const result = await f.runner.sendDraft(f.draft.id, { confirm: true });
  assert.equal(result.status, 'sent');
  assert.deepEqual(
    f.calls.map((c) => c.method),
    ['messages.markAsRead', 'messages.send']
  );
  assert.equal(f.calls[0].start_message_id, '1');
  assert.equal(f.calls[1].sticker_id, f.draft.sticker.id);
});
test('incoming edits during pacing and newly withheld consent prevent read, typing and delivery', async (t) => {
  for (const change of ['edit', 'opt-out']) {
    const f = await runnerFixture(t);
    f.hook(async () => {
      if (change === 'edit') {
        const message = await f.store.get('msg:vk:1');
        await f.store.put({ ...message, body: 'A different question' });
      } else {
        await saveSettings(f.store, { optOut: [{ source: 'vk', chat: '41' }] });
      }
    });
    await assert.rejects(f.runner.sendDraft(f.draft.id, { confirm: true }), {
      code: change === 'edit' ? 'gratitude-stale' : 'opted-out',
    });
    assert.equal(f.calls.length, 0);
    assert.ok(await f.store.get(f.draft.id));
  }
});
test('the reviewed greeting job uses pacing and retains its native receipt', async () => {
  const adapter = greetAdapter({ ids: [9] });
  await withGreetJob(
    async ({ store, job }) => {
      const f = queueFixture({ store });
      try {
        await f.enable();
        const result = await runGreet(job);
        assert.equal(result.last.status, 'confirmed');
        assert.equal(adapter.effects.length, 1);
        assert.ok(f.sleeps.reduce((total, ms) => total + ms, 0) >= 10000);
        const { items } = await loadVkSendQueue(store);
        assert.equal(items.length, 1);
        assert.equal(items[0].status, 'sent');
        assert.equal(items[0].delivery, 'sent');
        assert.equal(items[0].read, 'not-requested');
      } finally {
        await f.queue.close();
      }
    },
    { adapter }
  );
});
test(
  'reviewed text unwraps shared typing acknowledgements and both job and runner use one FIFO',
  { timeout: 10000 },
  async (t) => {
    const f = await runnerFixture(t);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    let first = true;
    f.hook(async () => {
      if (first) {
        first = false;
        entered.resolve();
        await release.promise;
      }
    });
    const foreground = f.runner.sendDraft(f.draft.id, {
      confirm: true,
      text: 'Thank you!',
    });
    let background;
    try {
      await entered.promise;
      const draft = {
        source: 'vk',
        chat: '8',
        text: 'Reviewed background message',
      };
      const context = {
        store: f.store,
        sleep: f.sleep,
        now: f.now,
        log: () => {},
        signal: new AbortController().signal,
      };
      background = queueVkPolicyMessage(
        context,
        { live: f.live, options: f.options },
        'background',
        draft,
        () =>
          guardedSend({
            store: f.store,
            key: 'background',
            draft,
            send: async (outgoing) => ({
              via: 'api',
              result: await f.live.post(outgoing, f.options),
            }),
          })
      );
      assert.equal(f.queue.inspect().waiting, 1);
      assert.equal(f.calls.length, 0);
      release.resolve();
      assert.equal((await foreground).status, 'sent');
      assert.equal((await background).status, 'sent');
      const sent = f.calls.filter((c) => c.method === 'messages.send');
      assert.deepEqual(
        sent.map((c) => c.peer_id),
        ['41', '8']
      );
      assert.equal(
        f.calls.filter((c) => c.method === 'messages.markAsRead').length,
        1
      );
      assert.ok(
        f.calls.filter((c) => c.method === 'messages.setActivity').length >= 2
      );
      assert.ok(
        (await loadVkSendQueue(f.store)).items.every(
          (row) => row.typing === 'confirmed'
        )
      );
    } finally {
      release.resolve();
      await Promise.allSettled([foreground, background].filter(Boolean));
    }
  }
);
