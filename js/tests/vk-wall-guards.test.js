import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallLedgerId } from '../src/automation/vk-wall-settings.js';
import { saveSettings } from '../src/automation/safety.js';
import {
  withWallJob,
  wallAdapter,
  runWall,
} from '../../experiments/issue-56/vk-wall-fixture.mjs';
import { cancelledNow } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';
import {
  pausedVkPolicy,
  verifyVkDurableWriteFailure,
} from './helpers/vk-policy-lifecycle.mjs';

test('actual write rate wait and durable intent acknowledgement recheck all reviewed wall admission evidence', async () => {
  for (const stage of ['limiter', 'ack']) {
    for (const change of [
      'wall',
      'old',
      'policy',
      'avatar',
      'account',
      'token',
      'expired',
      'backwards',
      'consent',
      'receipt',
    ]) {
      let mutate = async () => {};
      let armed = false;
      let now = cancelledNow;
      let token = 'fixture-user-token';
      const adapter = wallAdapter({
        limiter: {
          wait: async () => {
            if (armed && stage === 'limiter') {
              armed = false;
              await mutate();
            }
          },
        },
      });
      const effect = adapter.live.wallInviteEffect;
      adapter.live.wallInviteEffect = (...args) => {
        armed = true;
        return effect(...args);
      };
      await withWallJob(
        async ({ job, store, policy }) => {
          const { plan } = await job.preview();
          mutate = async () => {
            const changes = {
              wall: () => adapter.addPost(42, 'Another post'),
              old: () => {
                adapter.walls.get(42).at(-1).text += ' edited';
              },
              policy: () =>
                policy.save(store, {
                  ...plan.settings,
                  messages: 'Add me as a friend: changed',
                }),
              avatar: () => {
                adapter.profile.photo_id = '1_76';
              },
              account: () => adapter.account(2),
              token: () => {
                token = 'changed-token';
              },
              expired: () => {
                now += 300001;
              },
              backwards: () => {
                now--;
              },
              consent: () =>
                saveSettings(store, {
                  optOut: [{ source: 'vk', chat: '-42' }],
                }),
              receipt: () =>
                store.put({
                  id: wallLedgerId(1, 42),
                  status: 'unknown',
                  planId: 'another-owner',
                }),
            };
            await changes[change]();
          };
          if (stage === 'ack') {
            store.flush = async () => {
              if (
                (await store.get(wallLedgerId(1, 42)))?.status === 'pending'
              ) {
                store.flush = async () => {};
                await mutate();
              }
            };
          }
          const result = await job.run({ planId: plan.planId, confirm: true });
          assert.equal(result.last.status, 'refused', `${stage}/${change}`);
          assert.equal(adapter.effects.length, 0, `${stage}/${change}`);
          if (change === 'receipt') {
            assert.equal(
              (await store.get(wallLedgerId(1, 42))).planId,
              'another-owner'
            );
          }
        },
        {
          adapter,
          settings: { replaceOwned: true, activeAvatar: true },
          now: () => now,
          optionsFor: async () => ({ token }),
        }
      );
    }
  }
});
test('changed new receipts, old content, attachment identity, ownership and permission stop deletion after publication', async () => {
  for (const change of [
    'newText',
    'newMedia',
    'newOwner',
    'oldText',
    'oldMedia',
    'oldOwner',
    'oldPermission',
    'receipt',
  ]) {
    let mutate = async () => {};
    await withWallJob(
      async ({ job, adapter, store }) => {
        const { plan } = await job.preview();
        mutate = async () => {
          const posts = adapter.walls.get(42);
          const fresh = posts[0];
          const old = posts.find((p) => p.id === plan.items[0].old[0].id);
          const changes = {
            newText: () => {
              fresh.text += ' edited';
            },
            newMedia: () => {
              fresh.attachments[0].audio.id++;
            },
            newOwner: () => {
              fresh.from_id = 2;
            },
            oldText: () => {
              old.text += ' edited';
            },
            oldMedia: () => {
              old.attachments = [
                { type: 'photo', photo: { owner_id: 1, id: 90 } },
              ];
            },
            oldOwner: () => {
              old.from_id = 2;
            },
            oldPermission: () => {
              old.can_delete = 0;
            },
            receipt: () =>
              store.put({
                id: wallLedgerId(1, 42),
                status: 'unknown',
                planId: 'another-owner',
              }),
          };
          await changes[change]();
        };
        assert.equal(
          (await job.run({ planId: plan.planId, confirm: true })).last.status,
          'refused',
          change
        );
        assert.deepEqual(
          adapter.effects.map((s) => s.action),
          ['post'],
          change
        );
        assert.notEqual(
          (await job.preview()).plan.items[0].reason,
          'eligible',
          change
        );
        await runWall(job);
        assert.equal(adapter.effects.length, 1, change);
        if (change === 'receipt') {
          assert.equal(
            (await store.get(wallLedgerId(1, 42))).planId,
            'another-owner'
          );
        }
      },
      {
        settings: { replaceOwned: true },
        sleep: async () => {
          const current = mutate;
          mutate = async () => {};
          await current();
        },
      }
    );
  }
});
test('saved review tampering cannot invent publication or deletion acknowledgements', async () => {
  for (const change of [
    'postId',
    'deleted',
    'text',
    'attachments',
    'old',
    'createdAt',
    'guid',
  ]) {
    await withWallJob(
      async ({ job, store, adapter, policy }) => {
        const { plan } = await job.preview();
        const item = plan.items[0];
        if (change === 'postId') {
          item.postId = 999;
        }
        if (change === 'deleted') {
          item.deleted = item.old.map((p) => p.id);
        }
        if (change === 'text') {
          item.text += ' changed';
        }
        if (change === 'attachments') {
          item.attachments = [];
        }
        if (change === 'old') {
          item.old = [];
        }
        if (change === 'createdAt') {
          plan.createdAt++;
        }
        if (change === 'guid') {
          item.guid = 'changed';
        }
        await store.put({ ...plan, id: policy.keys.plan });
        assert.equal(
          (await job.run({ planId: plan.planId, confirm: true })).last.status,
          'refused',
          change
        );
        assert.equal(adapter.effects.length, 0, change);
        assert.equal(await store.get(wallLedgerId(1, 42)), null);
      },
      { settings: { replaceOwned: true } }
    );
  }
});
test('failed durable intent has no effect and failed post acknowledgement retains unknown without deleting', async () => {
  await verifyVkDurableWriteFailure(
    (check) => withWallJob(check, { settings: { replaceOwned: true } }),
    wallLedgerId(1, 42),
    runWall
  );
});
test('owned scheduling coalesces and shutdown retains the new post while aborting deletion pacing', async () => {
  const lifetime = pausedVkPolicy();
  await withWallJob(
    ({ job, adapter, store }) =>
      lifetime.verify(job, adapter, async () => {
        assert.equal((await store.get(wallLedgerId(1, 42))).status, 'partial');
      }),
    {
      ...lifetime.options,
      settings: { enabled: true, replaceOwned: true },
    }
  );
});
test('a new-post receipt cannot authorize deletion of that same retained post', async () => {
  const adapter = wallAdapter({
    methods: { 'wall.post': () => ({ post_id: 1001 }) },
  });
  await withWallJob(
    async ({ job, store }) => {
      assert.equal((await runWall(job)).last.status, 'unknown');
      assert.equal((await store.get(wallLedgerId(1, 42))).status, 'unknown');
      assert.equal(
        adapter.fake.calls.filter((c) => c.name === 'wall.delete').length,
        0
      );
      assert.equal((await job.preview()).plan.items[0].reason, 'unknown');
    },
    { adapter, settings: { replaceOwned: true } }
  );
});
