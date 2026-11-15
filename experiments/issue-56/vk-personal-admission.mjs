import assert from 'node:assert/strict';
import { saveSettings } from '../../js/src/automation/safety.js';
import { cancelledNow } from './vk-cancelled-fixture.mjs';

/** Finite hostile-input checks shared by personal VK delivery policies. */
export const verifyPersonalAdmission = async ({
  createAdapter,
  withJob,
  ledgerId,
  field,
  foreignStatus,
}) => {
  for (const stage of ['limiter', 'ack']) {
    for (const change of [
      'history',
      'permission',
      'policy',
      'account',
      'token',
      'time',
      'receipt',
      'online',
      'unread',
      'relationship',
      'consent',
    ]) {
      let mutate = async () => {};
      let now = cancelledNow;
      let token = 'fixture-user-token';
      const adapter = createAdapter({
        ids: [9],
        limiter: {
          wait: async () => {
            if (stage === 'limiter') {
              const current = mutate;
              mutate = async () => {};
              await current();
            }
          },
        },
      });
      await withJob(
        async ({ job, store, policy }) => {
          const { plan } = await job.preview();
          const mutation = async () => {
            const changes = {
              history: () =>
                adapter.addMessage(9, 'Changed history', { out: 0 }),
              permission: () => adapter.canWrite.set(9, false),
              policy: () =>
                policy.save(store, {
                  ...plan.settings,
                  [field]: 'Changed content',
                }),
              account: () => adapter.account(2),
              token: () => {
                token = 'changed-token';
              },
              time: () => {
                now += 300001;
              },
              receipt: () =>
                store.put({
                  id: ledgerId,
                  status: foreignStatus,
                  planId: 'another-owner',
                  attemptedAt: new Date(now).toISOString(),
                }),
              online: () => adapter.online.set(9, 0),
              unread: () => adapter.unread.set(9, 1),
              relationship: () => adapter.relations.set(9, 1),
              consent: () =>
                saveSettings(store, { optOut: [{ source: 'vk', chat: '9' }] }),
            };
            await changes[change]();
          };
          if (stage === 'ack') {
            store.flush = async () => {
              if ((await store.get(ledgerId))?.status === 'pending') {
                store.flush = async () => {};
                await mutation();
              }
            };
          } else {
            mutate = mutation;
          }
          const result = await job.run({ planId: plan.planId, confirm: true });
          assert.equal(result.last.status, 'refused', `${stage}/${change}`);
          assert.equal(adapter.effects.length, 0, `${stage}/${change}`);
          if (change === 'receipt') {
            assert.equal((await store.get(ledgerId)).planId, 'another-owner');
          }
        },
        { adapter, now: () => now, optionsFor: async () => ({ token }) }
      );
    }
  }
};
