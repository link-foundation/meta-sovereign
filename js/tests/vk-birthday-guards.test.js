import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withBirthdayJob,
  birthdayAdapter,
} from '../../experiments/issue-56/vk-birthday-fixture.mjs';
import { runReengage } from '../../experiments/issue-56/vk-reengage-fixture.mjs';
import { cancelledNow } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';
import { verifyPersonalAdmission } from '../../experiments/issue-56/vk-personal-admission.mjs';
import { reengageLedgerId } from '../src/automation/vk-reengage-settings.js';
import { currentVkPersonalPolicy } from '../src/automation/vk-personal-policy.js';
import { birthdayDate } from '../src/automation/vk-birthday-settings.js';
import { SETTINGS_ID } from '../src/automation/safety.js';
import {
  pausedVkPolicy,
  verifyVkDurableWriteFailure,
} from './helpers/vk-policy-lifecycle.mjs';
test('birthday admission rechecks real rate wait and durable intent against changed policy, identity, consent and history', async () => {
  await verifyPersonalAdmission({
    createAdapter: birthdayAdapter,
    withJob: withBirthdayJob,
    ledgerId: reengageLedgerId('birthday', 1, 9),
    field: 'messages',
    foreignStatus: 'unknown',
  });
});
test('failed birthday intent and post-send persistence preserve unknown outcomes and prevent replay', async () => {
  await verifyVkDurableWriteFailure(
    withBirthdayJob,
    reengageLedgerId('birthday', 1, 9),
    runReengage
  );
});
test('birthday scheduling coalesces and shutdown retains the acknowledged first step', async () => {
  const lifetime = pausedVkPolicy();
  await withBirthdayJob(({ job, adapter }) => lifetime.verify(job, adapter), {
    ...lifetime.options,
    settings: { enabled: true, stickers: '60302' },
  });
});
test('midnight during the final asynchronous consent read refuses the reviewed date', async () => {
  let now = Date.UTC(2026, 10, 15, 23, 59, 59);
  await withBirthdayJob(
    async ({ job, store, policy }) => {
      const { plan } = await job.preview();
      const get = store.get.bind(store);
      store.get = async (id) => {
        const value = await get(id);
        if (id === SETTINGS_ID) {
          now += 2000;
        }
        return value;
      };
      await assert.rejects(
        currentVkPersonalPolicy(
          {
            store,
            policy: {
              ...policy,
              cycle: (settings, instant) =>
                birthdayDate(instant, settings.timeZone),
            },
            isStopped: () => false,
            now: () => now,
            optionsFor: async () => ({ token: 'fixture-user-token' }),
          },
          plan,
          plan.items[0],
          { options: { token: 'fixture-user-token' } }
        ),
        /calendar date changed/
      );
    },
    { now: () => now }
  );
});
test('midnight and privacy changes after review or between acknowledged steps require a new review', async () => {
  for (const stage of ['before', 'between']) {
    for (const change of ['date', 'birthday']) {
      let now =
        stage === 'before' ? cancelledNow : Date.UTC(2026, 10, 15, 23, 59, 59);
      const adapter = birthdayAdapter({
        response: () => {
          if (stage === 'between') {
            if (change === 'date') {
              now += 2000;
              adapter.now(now);
            } else {
              adapter.birthdays.delete(9);
            }
          }
          return 'confirmed';
        },
      });
      await withBirthdayJob(
        async ({ job, store }) => {
          const { plan } = await job.preview();
          if (stage === 'before') {
            if (change === 'date') {
              now += 86400000;
              adapter.now(now);
            } else {
              adapter.birthdays.delete(9);
            }
          }
          assert.equal(
            (await job.run({ planId: plan.planId, confirm: true })).last.status,
            'refused'
          );
          assert.equal(adapter.effects.length, stage === 'between' ? 1 : 0);
          if (stage === 'between') {
            assert.equal(
              (await store.get(reengageLedgerId('birthday', 1, 9))).status,
              'partial'
            );
            assert.notEqual(
              (await job.preview()).plan.items[0].reason,
              'eligible'
            );
          }
        },
        { adapter, now: () => now, settings: { stickers: '60302' } }
      );
    }
  }
});
