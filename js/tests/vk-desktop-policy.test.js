import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { saveVkFriends, loadVkFriends } from '../src/automation/vk-friends.js';
import {
  readFriendQuota,
  availableFriendQuota,
} from '../src/automation/vk-friend-quota.js';
import { friendsJob } from '../../experiments/issue-56/vk-friends-fixture.mjs';
import {
  desktopAdapter,
  desktopSettings,
  desktopServer,
  withDesktopJob,
} from '../../experiments/issue-56/vk-desktop-fixture.mjs';
import { createVkFriendsApi } from '../src/web/vk-friends-api.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';

test(
  'desktop quota ranks mutuals, protects priority order and cannot be inflated by repeated review or reopen',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-desktop-'));
    let store;
    let job;
    const adapter = desktopAdapter();
    try {
      store = await createLinoTextStore(join(dir, 'state.lino'));
      await saveVkFriends(store, { ...desktopSettings, priorityIds: [7] });
      job = friendsJob(store, adapter);
      const first = (await job.preview()).plan;
      assert.deepEqual(first.quota, {
        observed: 20,
        reserved: 0,
        available: 2,
      });
      assert.deepEqual(
        first.items
          .filter((row) => row.reason === 'eligible')
          .map((row) => row.userId),
        [7, 109, 119]
      );
      assert.deepEqual((await job.preview()).plan.quota, first.quota);
      const plan = (await job.preview()).plan;
      await job.run({ planId: plan.planId, confirm: true });
      assert.deepEqual(adapter.effects, [7, 109, 119]);
      await job.stop();
      await store.close();
      store = null;
      store = await createLinoTextStore(join(dir, 'state.lino'));
      job = friendsJob(store, adapter);
      const next = (await job.preview()).plan;
      assert.deepEqual(next.quota, { observed: 20, reserved: 2, available: 0 });
      assert.equal(
        next.items.filter((row) => row.reason === 'eligible').length,
        0
      );
      assert.equal(
        next.items.filter((row) => row.reason === 'quota').length,
        18
      );
      const request = adapter.fake.calls.find(
        (row) => row.name === 'friends.getMutual'
      );
      assert.equal(request.params.target_uids.split(',').length, 20);
    } finally {
      await job?.stop();
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('desktop threshold admits only positive mutuals and retains the absolute provider capacity', async () => {
  for (const count of [2, 10000]) {
    const store = createMemoryStore();
    const adapter = desktopAdapter({ count, ids: [101, 102, 110] });
    const job = friendsJob(store, adapter);
    try {
      await saveVkFriends(store, { ...desktopSettings, maxFriends: 2 });
      const plan = (await job.preview()).plan;
      assert.deepEqual(
        plan.items
          .filter((row) => row.reason === 'eligible')
          .map((row) => row.userId),
        count === 2 ? [102, 101] : []
      );
      assert.equal(
        plan.items.find((row) => row.userId === 110).reason,
        count === 2 ? 'noMutual' : 'capacity'
      );
      await job.run({ planId: plan.planId, confirm: true });
      assert.deepEqual(adapter.effects, count === 2 ? [102, 101] : []);
    } finally {
      await job.stop();
    }
  }
});

test('changed mutual evidence, threshold crossing and malformed mutual replies refuse effects', async () => {
  for (const mode of [
    'mutual',
    'threshold',
    'missing',
    'duplicate',
    'negative',
    'string',
  ]) {
    const store = createMemoryStore();
    const malformed = {
      missing: [],
      duplicate: [
        { id: 101, common_count: 2 },
        { id: 101, common_count: 1 },
      ],
      negative: [
        { id: 101, common_count: -1 },
        { id: 102, common_count: 1 },
      ],
      string: [
        { id: 101, common_count: '2' },
        { id: 102, common_count: 1 },
      ],
    };
    const adapter = desktopAdapter({
      count: 2,
      ids: [101, 102],
      methods: malformed[mode]
        ? { 'friends.getMutual': () => malformed[mode] }
        : {},
    });
    const job = friendsJob(store, adapter);
    try {
      await saveVkFriends(store, { ...desktopSettings, maxFriends: 2 });
      if (malformed[mode]) {
        await assert.rejects(job.preview(), /Incomplete/);
      } else {
        const plan = (await job.preview()).plan;
        if (mode === 'mutual') {
          adapter.mutuals.set(102, 0);
        } else {
          adapter.count(1);
        }
        const result = await job.run({ planId: plan.planId, confirm: true });
        assert.equal(result.last.status, 'refused');
      }
      assert.deepEqual(adapter.effects, [], mode);
    } finally {
      await job.stop();
    }
  }
});

test('unknown attempts reserve quota while a definite refusal releases only its reservation', async () => {
  for (const mode of ['unknown', 'unconfirmed', 'refused']) {
    await withDesktopJob(async ({ store, adapter, job }) => {
      const plan = (await job.preview()).plan;
      adapter.mode(mode);
      const answer = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(
        answer.last.status,
        mode === 'refused' ? 'refused' : 'unknown'
      );
      const quota = await readFriendQuota(store, 1);
      assert.equal(availableFriendQuota(quota), mode === 'refused' ? 2 : 1);
      const next = (await job.preview()).plan;
      assert.equal(
        next.items.find((row) => row.userId === 109).reason,
        mode === 'refused' ? 'eligible' : 'unknown'
      );
      assert.equal(adapter.effects.length, 1);
    });
  }
});

test('failed quota acknowledgement prevents effects and failed outcome acknowledgement keeps the reservation', async () => {
  for (const mode of ['quota', 'outcome']) {
    await withDesktopJob(async ({ store, adapter, job }) => {
      const plan = (await job.preview()).plan;
      store.flush = async () => {
        const quota = await readFriendQuota(store, 1);
        const receipt = await store.get('provider-friend:vk:1:109');
        if (
          (mode === 'quota' && quota.reservations.length) ||
          (mode === 'outcome' && receipt?.status === 'confirmed')
        ) {
          throw new Error('Fixture quota acknowledgement refused');
        }
      };
      const result = await job
        .run({ planId: plan.planId, confirm: true })
        .catch((error) => error);
      assert.ok(result instanceof Error || result.last.status === 'refused');
      assert.equal(adapter.effects.length, mode === 'quota' ? 0 : 1);
      assert.equal(
        (await readFriendQuota(store, 1)).reservations.length,
        mode === 'quota' ? 0 : 1
      );
      if (mode === 'outcome') {
        assert.equal(
          (await store.get('provider-friend:vk:1:109')).status,
          'pending'
        );
      }
    });
  }
});

test(
  'both Lino encodings and offline choices retain desktop policy without granting implicit effects',
  { timeout: 10000 },
  async () => {
    const fixture = await desktopServer();
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = createWirePost(fixture.base, '/api/vk/friends', type);
        assert.equal(
          (await post('', desktopSettings, 'https://foreign.invalid')).status,
          403
        );
        assert.equal(
          (await post('', desktopSettings)).answer.settings.acceptancePolicy,
          'desktop-ten-percent'
        );
        assert.equal((await post('/run', { scheduled: true })).status, 400);
        const plan = (await post('/plan', {})).answer.plan;
        assert.equal(plan.quota.observed, 20);
        assert.equal(fixture.effects.length, 0);
      }
      fixture.refuseWrites(true);
      const post = createWirePost(fixture.base, '/api/vk/friends', LINO_TEXT);
      assert.equal(
        (
          await post('', {
            ...desktopSettings,
            acceptancePolicy: 'ranked-batch',
          })
        ).status,
        400
      );
      assert.equal(
        (await loadVkFriends(fixture.store)).settings.acceptancePolicy,
        'desktop-ten-percent'
      );
      assert.equal(fixture.messages(), 0);
    } finally {
      await fixture.close();
    }
    const store = createMemoryStore();
    const api = createVkFriendsApi({
      get: async () => null,
      report: async () => null,
      local: async () => store,
    });
    assert.equal(
      (await api.saveVkFriends(desktopSettings)).settings.acceptancePolicy,
      'desktop-ten-percent'
    );
    assert.equal((await api.vkFriends()).canRun, false);
    assert.equal((await api.planVkFriends()).ok, false);
    for (const dict of Object.values(dictionaries)) {
      for (const key of [
        'acceptancePolicy',
        'desktop-ten-percent',
        'ranked-batch',
        'mutualOnlyAt',
        'desktopHint',
        'quota',
        'noMutual',
        'quotaSummary',
        'mutualCount',
      ]) {
        assert.equal(typeof dict[`vkFriends.${key}`], 'string');
      }
    }
  }
);

test('the foreground CLI saves the distinct policy and rejects invalid policy values', async () => {
  const { createVkFriendsCommands } =
    await import('../src/cli/vk-friends-commands.js');
  const store = createMemoryStore();
  let closes = 0;
  store.close = async () => {
    closes++;
  };
  const command = createVkFriendsCommands({
    openStore: async () => store,
    openReadOnly: async () => store,
  })['vk-friends'];
  await command(
    { _: ['save'], 'acceptance-policy': 'desktop-ten-percent' },
    () => {}
  );
  assert.equal(
    (await loadVkFriends(store)).settings.acceptancePolicy,
    'desktop-ten-percent'
  );
  await assert.rejects(
    command({ _: ['save'], 'acceptance-policy': 'invalid' }, () => {}),
    /acceptancePolicy/
  );
  assert.equal(closes, 2);
});

test('quota acknowledgement cannot authorize late changed mutuals or policy', async () => {
  for (const change of ['mutuals', 'policy']) {
    await withDesktopJob(async ({ store, adapter, job }) => {
      const plan = (await job.preview()).plan;
      let changed = false;
      store.flush = async () => {
        if (!changed && (await readFriendQuota(store, 1)).reservations.length) {
          changed = true;
          if (change === 'mutuals') {
            adapter.mutuals.set(109, 0);
          } else {
            await store.put({
              ...desktopSettings,
              id: 'provider-job:vk:friends',
              acceptancePolicy: 'ranked-batch',
            });
          }
        }
      };
      const result = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(changed, true);
      assert.equal(result.last.status, 'refused');
      assert.equal((await readFriendQuota(store, 1)).reservations.length, 0);
      assert.deepEqual(adapter.effects, []);
    });
  }
});
