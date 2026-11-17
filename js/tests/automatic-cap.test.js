import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automaticSources,
  capNow,
  capAutomation,
  confirmedTarget,
  withAutomaticCap,
} from '../../experiments/issue-56/automatic-cap-fixture.mjs';
import { queueDrafts } from '../src/automation/drafts.js';
import { createAutopilot, autopilotId } from '../src/automation/autopilot.js';
import { outboxId } from '../src/automation/outbox.js';

for (const source of automaticSources) {
  test(
    `simultaneous ${source} cap snapshots cannot admit disjoint batches`,
    { timeout: 5000 },
    async () =>
      withAutomaticCap(async ({ effects, automation, runner, paced }) => {
        const active = runner();
        const a = await confirmedTarget(active, automation, source, '201');
        const b = await confirmedTarget(active, automation, source, '202');
        const result = await Promise.all([
          paced()(automation, a.confirmed),
          paced()(automation, b.confirmed),
        ]);
        assert.equal(effects.length, 1);
        assert.equal(result.flatMap((item) => item.results).length, 1);
      })
  );
  test(
    `disjoint confirmed ${source} batches share a daily cap across runners`,
    { timeout: 5000 },
    async () =>
      withAutomaticCap(async ({ effects, automation, runner }) => {
        const first = runner();
        const second = runner();
        const a = await confirmedTarget(first, automation, source, '201');
        const b = await confirmedTarget(second, automation, source, '202');
        const result = await Promise.all([
          first.run(automation, a),
          second.run(automation, b),
        ]);
        assert.equal(effects.length, 1);
        assert.equal(result.flatMap((item) => item.results).length, 1);
        assert.equal(
          result.reduce((count, item) => count + (item.capped ?? 0), 0),
          1
        );
      })
  );

  test(
    `a ${source} autopilot step and batch share the same daily admission`,
    { timeout: 5000 },
    async () =>
      withAutomaticCap(async ({ effects, automation, runner }) => {
        const first = runner();
        const second = runner();
        const a = await confirmedTarget(first, automation, source, '201');
        const b = await confirmedTarget(second, automation, source, '202');
        await Promise.all([
          first.run(automation, a),
          second.deliverDraft(automation, b.confirmed[0]),
        ]);
        assert.equal(effects.length, 1);
      })
  );

  for (const status of ['sent', 'sending', 'unknown']) {
    test(
      `a ${status} ${source} outbox receipt alone caps a new automatic step`,
      { timeout: 5000 },
      async () =>
        withAutomaticCap(async ({ store, effects, automation, runner }) => {
          const active = runner();
          const next = await confirmedTarget(active, automation, source, '202');
          await store.put({
            id: outboxId('earlier'),
            owner: automation.id,
            source,
            chat: '201',
            status,
            at: capNow,
          });
          const result = await active.deliverDraft(
            automation,
            next.confirmed[0]
          );
          assert.equal(result.status, 'failed');
          assert.equal(result.code, 'daily-cap');
          assert.equal(effects.length, 0);
        })
    );
  }
}

test(
  'a definite refusal releases daily capacity for a later automatic target',
  { timeout: 5000 },
  async () => {
    let calls = 0;
    await withAutomaticCap(
      async ({ automation, runner }) => {
        const active = runner();
        const a = await confirmedTarget(active, automation, 'telegram', '201');
        const b = await confirmedTarget(active, automation, 'telegram', '202');
        assert.equal(
          (await active.deliverDraft(automation, a.confirmed[0])).status,
          'failed'
        );
        assert.equal(
          (await active.deliverDraft(automation, b.confirmed[0])).status,
          'sent'
        );
        assert.equal(calls, 2);
      },
      async () => {
        if (++calls === 1) {
          throw Object.assign(new Error('Synthetic definite refusal'), {
            code: 'write-forbidden',
          });
        }
        return {};
      }
    );
  }
);

test(
  'an unknown automatic send consumes capacity without a recovery retry',
  { timeout: 5000 },
  async () => {
    await withAutomaticCap(
      async ({ effects, automation, runner }) => {
        const active = runner();
        const a = await confirmedTarget(active, automation, 'telegram', '201');
        const b = await confirmedTarget(active, automation, 'telegram', '202');
        assert.equal(
          (await active.deliverDraft(automation, a.confirmed[0])).status,
          'unknown'
        );
        const result = await runner().deliverDraft(automation, b.confirmed[0]);
        assert.equal(result.code, 'daily-cap');
        assert.equal(effects.length, 1);
      },
      async () => {
        throw Object.assign(new Error('Synthetic uncertain response'), {
          code: 'send-unknown',
        });
      }
    );
  }
);

test(
  'a refused capacity read propagates and does not poison later admissions',
  { timeout: 5000 },
  async () => {
    await withAutomaticCap(async ({ store, effects, automation, runner }) => {
      const active = runner();
      const a = await confirmedTarget(active, automation, 'telegram', '201');
      const query = store.query.bind(store);
      let refuse = true;
      store.query = async (...args) => {
        if (refuse) {
          refuse = false;
          throw new Error('Synthetic capacity read refusal');
        }
        return query(...args);
      };
      await assert.rejects(
        active.deliverDraft(automation, a.confirmed[0]),
        /capacity read refusal/u
      );
      assert.equal(effects.length, 0);
      assert.equal(
        (await runner().deliverDraft(automation, a.confirmed[0])).status,
        'sent'
      );
    });
  }
);

test(
  'held provider delivery retains its reservation without blocking a different owner',
  { timeout: 5000 },
  async (t) => {
    const entered = Promise.withResolvers();
    const held = Promise.withResolvers();
    t.signal.addEventListener('abort', () => held.resolve({}), { once: true });
    await withAutomaticCap(
      async ({ effects, automation, runner }) => {
        const active = runner();
        const a = await confirmedTarget(active, automation, 'telegram', '201');
        const b = await confirmedTarget(active, automation, 'telegram', '202');
        const other = capAutomation('independent-owner');
        const c = await confirmedTarget(active, other, 'telegram', '203');
        const first = active.deliverDraft(automation, a.confirmed[0]);
        try {
          await entered.promise;
          assert.equal(
            (await runner().deliverDraft(automation, b.confirmed[0])).code,
            'daily-cap'
          );
          assert.equal(
            (await runner().deliverDraft(other, c.confirmed[0])).status,
            'sent'
          );
          assert.equal(effects.length, 2);
        } finally {
          held.resolve({});
          await first;
        }
      },
      async (draft) => {
        if (draft.chat === '201') {
          entered.resolve();
          return held.promise;
        }
        return {};
      }
    );
  }
);

test(
  'explicit owner-reviewed draft sends retain their existing confirmation policy',
  { timeout: 5000 },
  async () => {
    await withAutomaticCap(async ({ store, effects, automation, runner }) => {
      const active = runner();
      const a = await confirmedTarget(active, automation, 'telegram', '201');
      const b = await confirmedTarget(active, automation, 'telegram', '202');
      assert.equal(
        (await active.deliverDraft(automation, a.confirmed[0])).status,
        'sent'
      );
      const [draft] = await queueDrafts(store, automation, b.confirmed, capNow);
      const result = await active.sendDraft(draft.id, {
        confirm: true,
        confirmedDraft: draft,
      });
      assert.equal(result.status, 'sent');
      assert.equal(effects.length, 2);
    });
  }
);

test(
  'an automatic cap race enters the normal durable wait without counting a failure',
  { timeout: 5000 },
  async (t) => {
    await withAutomaticCap(async ({ store, automation }) => {
      const observed = Promise.withResolvers();
      const drained = Promise.withResolvers();
      let waiting = false;
      const pilot = createAutopilot({
        store,
        clock: () => new Date(capNow),
        runner: {
          load: async () => automation,
          next: async () => ({ draft: { source: 'telegram', chat: '202' } }),
          deliverDraft: async () => {
            await store.put({
              id: outboxId('concurrent-intent'),
              owner: automation.id,
              source: 'telegram',
              chat: '201',
              status: 'sending',
              at: capNow,
            });
            return { status: 'failed', code: 'daily-cap' };
          },
        },
        sleep: async (ms, signal) => {
          waiting = true;
          observed.resolve(ms);
          try {
            if (!signal.aborted) {
              await new Promise((resolve) =>
                signal.addEventListener('abort', resolve, { once: true })
              );
            }
          } finally {
            drained.resolve();
          }
        },
        log: (event) => {
          if (event.event === 'autopilot_send_failed') {
            observed.resolve(null);
          }
        },
      });
      t.signal.addEventListener('abort', () => observed.resolve(null), {
        once: true,
      });
      try {
        await pilot.start(automation);
        assert.equal(await observed.promise, 86400000);
        const state = await store.get(autopilotId(automation));
        assert.equal(state.status, 'capped');
        assert.equal(state.on, true);
        assert.equal(state.failed, 0);
      } finally {
        await pilot.stop(automation);
        if (waiting) {
          await drained.promise;
        }
      }
    });
  }
);
