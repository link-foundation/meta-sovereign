import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallLedgerId } from '../src/automation/vk-wall-settings.js';
import {
  wallAdapter,
  withWallJob,
  wallJob,
  runWall,
} from '../../experiments/issue-56/vk-wall-fixture.mjs';
import {
  wallParityAdapter,
  removeWallPost,
} from '../../experiments/issue-56/vk-wall-parity-fixture.mjs';

test('successful empty current wall evidence establishes absence without accepting malformed reads', async () => {
  for (const response of [[], { items: [] }]) {
    const adapter = wallAdapter({
      methods: { 'wall.getById': () => response },
    });
    assert.equal(
      await adapter.live.wallInvitePostState(42, 999, {
        token: 'fixture-user-token',
      }),
      null
    );
    assert.equal(adapter.effects.length, 0);
  }
  for (const response of [undefined, {}, { items: null }, [null], [1, 2]]) {
    const adapter = wallAdapter({
      methods: { 'wall.getById': () => response },
    });
    await assert.rejects(
      adapter.live.wallInvitePostState(42, 999, {
        token: 'fixture-user-token',
      })
    );
    assert.equal(adapter.effects.length, 0);
  }
});

test('optional any-author top-ten hold upgrades legacy settings and preserves the own-author default', async () => {
  await withWallJob(async ({ job, adapter, policy, store }) => {
    const original = await policy.settings(store);
    assert.equal(original.holdAnyVisible, false);
    const legacy = { ...original };
    delete legacy.holdAnyVisible;
    await store.put({ id: policy.keys.job, ...legacy });
    assert.deepEqual(await policy.settings(store), original);
    for (const value of [null, 'true', 1, undefined]) {
      await assert.rejects(
        policy.save(store, { ...original, holdAnyVisible: value })
      );
    }
    adapter.addPost(42, 'Add me as a friend: visible other author', {
      from_id: 2,
    });
    assert.equal((await job.preview()).plan.items[0].reason, 'eligible');
    await policy.save(store, { ...original, holdAnyVisible: true });
    assert.equal(
      (await job.preview()).plan.items[0].reason,
      'visibleInvitation'
    );
    await runWall(job);
    assert.equal(adapter.effects.length, 0);
    await policy.save(store, original);
    adapter.addPost(42, 'Add me as a friend: own visible invitation');
    assert.equal((await job.preview()).plan.items[0].reason, 'visible');
  });
});

test('definite 100 and 104 refusals require successful current absence before continuing other reviewed deletions', async () => {
  for (const code of [100, 104]) {
    await withWallJob(
      async ({ job, adapter, store }) => {
        const { plan } = await job.preview();
        const [missing, deleted] = plan.items[0].old.map((post) => post.id);
        const { last } = await job.run({ planId: plan.planId, confirm: true });
        assert.equal(last.status, 'confirmed');
        assert.equal(last.results[0].outcome, 'deliveredWithAbsent');
        assert.deepEqual(last.results[0].absent, [missing]);
        const receipt = await store.get(wallLedgerId(1, 42));
        assert.equal(receipt.status, 'confirmed');
        assert.deepEqual(receipt.absent, [missing]);
        assert.deepEqual(receipt.deleted, [deleted]);
        assert.deepEqual(
          adapter.effects.map((step) => step.action),
          ['post', 'delete', 'delete']
        );
        await runWall(job);
        assert.equal(adapter.effects.length, 3);
      },
      { adapter: wallParityAdapter(code), settings: { replaceOwned: true } }
    );
  }
});

test('absence during deletion pacing or the actual rate wait is retained without issuing a delete', async () => {
  for (const stage of ['pace', 'limiter', 'ack']) {
    let remove = () => {};
    let armed = false;
    const adapter = wallAdapter({
      limiter: {
        wait: async () => {
          if (armed && stage === 'limiter') {
            armed = false;
            remove();
          }
        },
      },
    });
    const effect = adapter.live.wallInviteEffect;
    adapter.live.wallInviteEffect = (...args) => {
      armed = args[0].action === 'delete';
      return effect(...args);
    };
    await withWallJob(
      async ({ job, store }) => {
        const { plan } = await job.preview();
        const id = plan.items[0].old[0].id;
        remove = () => removeWallPost(adapter, id);
        if (stage === 'ack') {
          store.flush = async () => {
            const receipt = await store.get(wallLedgerId(1, 42));
            if (receipt?.status === 'pending' && receipt.postId) {
              remove();
            }
          };
        }
        const { last } = await job.run({ planId: plan.planId, confirm: true });
        assert.equal(last.status, 'confirmed', stage);
        assert.deepEqual(last.results[0].absent, [id], stage);
        assert.deepEqual(last.results[0].deleted, [], stage);
        assert.deepEqual(
          adapter.effects.map((step) => step.action),
          ['post'],
          stage
        );
      },
      {
        adapter,
        settings: { replaceOwned: true },
        sleep: async () => {
          if (stage === 'pace') {
            remove();
          }
        },
      }
    );
  }
});

test('manual partial recovery reviews confirmed absence and refuses restored posts without reposting', async () => {
  for (const restore of [false, true]) {
    const adapter = wallAdapter({
      response: (step) => (step.action === 'delete' ? 'refused' : 'confirmed'),
    });
    await withWallJob(
      async ({ job, store }) => {
        const { plan } = await job.preview();
        const old = {
          ...adapter.walls
            .get(42)
            .find((post) => post.id === plan.items[0].old[0].id),
        };
        assert.equal(
          (await job.run({ planId: plan.planId, confirm: true })).last.status,
          'refused'
        );
        removeWallPost(adapter, old.id);
        await job.stop();
        const reopened = wallJob(store, adapter);
        try {
          const review = (await reopened.preview()).plan;
          assert.equal(review.items[0].reason, 'eligible');
          assert.deepEqual(review.items[0].absent, [old.id]);
          if (restore) {
            adapter.walls.get(42).push(old);
          }
          const { last } = await reopened.run({
            planId: review.planId,
            confirm: true,
          });
          assert.equal(last.status, restore ? 'refused' : 'confirmed');
          assert.deepEqual(
            adapter.effects.map((step) => step.action),
            ['post', 'delete']
          );
        } finally {
          await reopened.stop();
        }
      },
      { adapter, settings: { replaceOwned: true } }
    );
  }
});

test('forged absent evidence and missing new-post receipts refuse without inventing deletion results', async () => {
  for (const change of ['absent', 'reviewedAbsent', 'newPost']) {
    let remove = () => {};
    await withWallJob(
      async ({ job, store, adapter, policy }) => {
        const { plan } = await job.preview();
        const item = plan.items[0];
        if (change === 'newPost') {
          remove = () => removeWallPost(adapter, adapter.walls.get(42)[0].id);
        } else {
          item[change] = item.old.map((post) => post.id);
          await store.put({ ...plan, id: policy.keys.plan });
        }
        assert.equal(
          (await job.run({ planId: plan.planId, confirm: true })).last.status,
          'refused'
        );
        assert.equal(adapter.effects.length, change === 'newPost' ? 1 : 0);
      },
      { settings: { replaceOwned: true }, sleep: async () => remove() }
    );
  }
});

test('unknown deletion stays unknown even if the old post disappears; definite refusal alone never proves absence', async () => {
  for (const response of ['unknown', 'refused']) {
    const adapter = wallAdapter({
      response: (step) => {
        if (step.action !== 'delete') {
          return 'confirmed';
        }
        if (response === 'unknown') {
          removeWallPost(adapter, step.postId);
        }
        return response;
      },
    });
    await withWallJob(
      async ({ job, store }) => {
        const { last } = await runWall(job);
        assert.equal(
          last.status,
          response === 'unknown' ? 'unknown' : 'refused'
        );
        assert.deepEqual((await store.get(wallLedgerId(1, 42))).absent, []);
        await runWall(job);
        assert.equal(
          adapter.effects.filter((step) => step.action === 'post').length,
          1
        );
      },
      { adapter, settings: { replaceOwned: true } }
    );
  }
});
