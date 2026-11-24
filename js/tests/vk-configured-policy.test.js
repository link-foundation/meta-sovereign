import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVkFriendSettings } from '../src/automation/vk-friends-settings.js';
import {
  readFriendQuota,
  availableFriendQuota,
} from '../src/automation/vk-friend-quota.js';
import { saveVkFriends } from '../src/automation/vk-friends.js';
import {
  configuredFriendSettings as settings,
  withConfiguredFriends as fixture,
} from '../../experiments/issue-56/vk-configured-fixture.mjs';
import {
  desktopSettings,
  withDesktopJob,
} from '../../experiments/issue-56/vk-desktop-fixture.mjs';

const eligible = (plan) =>
  plan.items
    .filter((item) => item.reason === 'eligible')
    .map((item) => item.userId);

test('configured lifetime percentage retains finite zero, fractional and full allowance settings', () => {
  for (const topPercentMutuals of [0, 12.5, 25, 100]) {
    assert.equal(
      normalizeVkFriendSettings({ ...settings, topPercentMutuals })
        .topPercentMutuals,
      topPercentMutuals
    );
  }
  for (const topPercentMutuals of [-1, 100.1, NaN, Infinity, '25', null]) {
    assert.throws(
      () => normalizeVkFriendSettings({ ...settings, topPercentMutuals }),
      /topPercentMutuals/
    );
  }
});

test('absent percentage keeps the exact legacy record shape and ten-percent allowance', () => {
  assert.deepEqual(normalizeVkFriendSettings(desktopSettings), desktopSettings);
  assert.equal(
    availableFriendQuota({
      seenIds: Array.from({ length: 20 }),
      reservations: [],
    }),
    2
  );
});

test('configured percentage ranks distinct lifetime observations and survives confirmed reservations', async () => {
  await fixture(async ({ store, adapter, job }) => {
    const plan = (await job.preview()).plan;
    assert.deepEqual(plan.quota, { observed: 20, reserved: 0, available: 5 });
    assert.deepEqual(eligible(plan), [109, 119, 108, 118, 107]);
    assert.deepEqual((await job.preview()).plan.quota, plan.quota);
    const fresh = (await job.preview()).plan;
    await job.run({ planId: fresh.planId, confirm: true });
    assert.deepEqual(adapter.effects, eligible(fresh));
    assert.deepEqual((await job.preview()).plan.quota, {
      observed: 20,
      reserved: 5,
      available: 0,
    });
    assert.equal(
      availableFriendQuota(await readFriendQuota(store, 1), settings),
      0
    );
  });
});

test('configured capacity limits both incoming and priority requests without a threshold exception', async () => {
  for (const count of [1, 2]) {
    await fixture(
      async ({ adapter, job }) => {
        const plan = (await job.preview()).plan;
        assert.deepEqual(eligible(plan), count === 1 ? [7] : []);
        assert.equal(
          plan.items.find((row) => row.userId === 109).reason,
          'capacity'
        );
        await job.run({ planId: plan.planId, confirm: true });
        assert.deepEqual(adapter.effects, count === 1 ? [7] : []);
      },
      { maxFriends: 2, priorityIds: [7] },
      { count }
    );
  }
});

test('configured zero allowance holds incoming requests while priority requests retain capacity checks', async () => {
  await fixture(
    async ({ adapter, job }) => {
      const plan = (await job.preview()).plan;
      assert.deepEqual(eligible(plan), [7]);
      assert.equal(
        plan.items.filter((item) => item.reason === 'quota').length,
        20
      );
      await job.run({ planId: plan.planId, confirm: true });
      assert.deepEqual(adapter.effects, [7]);
    },
    { topPercentMutuals: 0, priorityIds: [7] }
  );
});

test('configured fractional allowance floors before subtracting reservations and respects free slots', async () => {
  await fixture(
    async ({ adapter, job }) => {
      const plan = (await job.preview()).plan;
      assert.equal(plan.quota.available, 2);
      assert.deepEqual(eligible(plan), [109]);
      await job.run({ planId: plan.planId, confirm: true });
      assert.deepEqual(adapter.effects, [109]);
      assert.deepEqual(eligible((await job.preview()).plan), []);
    },
    { topPercentMutuals: 12.5, maxFriends: 2 }
  );
});

test('unknown configured attempts retain reservations and definite refusals release only their own slot', async () => {
  for (const mode of ['unknown', 'unconfirmed', 'refused']) {
    await fixture(async ({ store, adapter, job }) => {
      const plan = (await job.preview()).plan;
      adapter.mode(mode);
      const result = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(
        result.last.status,
        mode === 'refused' ? 'refused' : 'unknown'
      );
      assert.equal(
        availableFriendQuota(await readFriendQuota(store, 1), settings),
        mode === 'refused' ? 5 : 4
      );
      const next = (await job.preview()).plan;
      assert.equal(
        next.items.find((item) => item.userId === 109).reason,
        mode === 'refused' ? 'eligible' : 'unknown'
      );
      assert.equal(adapter.effects.length, 1);
    });
  }
});

test('changed configured percentage invalidates the frozen review without effects', async () => {
  await fixture(async ({ store, adapter, job }) => {
    const plan = (await job.preview()).plan;
    await saveVkFriends(store, { ...settings, topPercentMutuals: 20 });
    await assert.rejects(
      job.run({ planId: plan.planId, confirm: true }),
      /changed/
    );
    assert.deepEqual(adapter.effects, []);
  });
});

test('fresh configured capacity, mutual evidence and late quota changes refuse before effects', async () => {
  for (const changed of ['capacity', 'mutuals', 'quota']) {
    await fixture(async ({ store, adapter, job }) => {
      const plan = (await job.preview()).plan;
      if (changed === 'capacity') {
        adapter.count(settings.maxFriends);
      } else if (changed === 'mutuals') {
        adapter.mutuals.set(109, 0);
      } else {
        const quota = await readFriendQuota(store, 1);
        await store.put({ ...quota, reservations: ['a', 'b', 'c', 'd', 'e'] });
      }
      const result = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(result.last.status, 'refused');
      assert.deepEqual(adapter.effects, []);
      assert.equal(
        (await readFriendQuota(store, 1)).reservations.length,
        changed === 'quota' ? 5 : 0
      );
    });
  }
});

test('refused configured quota acknowledgement prevents effects and retains available allowance', async () => {
  await fixture(async ({ store, adapter, job }) => {
    const plan = (await job.preview()).plan;
    store.flush = async () => {
      if ((await readFriendQuota(store, 1)).reservations.length) {
        throw new Error('Fixture quota acknowledgement refused');
      }
    };
    const result = await job.run({ planId: plan.planId, confirm: true });
    assert.equal(result.last.status, 'refused');
    assert.deepEqual(adapter.effects, []);
    assert.equal(
      availableFriendQuota(await readFriendQuota(store, 1), settings),
      5
    );
  });
});

test('existing mutual-threshold mode also honors an explicitly configured percentage', async () => {
  await withDesktopJob(async ({ store, adapter, job }) => {
    await saveVkFriends(store, { ...desktopSettings, topPercentMutuals: 25 });
    const plan = (await job.preview()).plan;
    assert.equal(plan.quota.available, 5);
    await job.run({ planId: plan.planId, confirm: true });
    assert.equal(adapter.effects.length, 5);
  });
});
