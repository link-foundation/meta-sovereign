import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import {
  wallPolicy,
  wallLedgerId,
} from '../src/automation/vk-wall-settings.js';
import {
  withWallJob,
  wallAdapter,
  wallJob,
  runWall,
} from '../../experiments/issue-56/vk-wall-fixture.mjs';
import { cancelledNow } from '../../experiments/issue-56/vk-cancelled-fixture.mjs';
import { saveSettings } from '../src/automation/safety.js';

test('wall invitations default off, validate destinations and native media, and preserve a strict zero limit', async () => {
  await withWallJob(async ({ policy, store, job, adapter }) => {
    const defaults = await policy.settings(store);
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.replaceOwned, false);
    assert.equal(defaults.activeAvatar, false);
    for (const input of [
      { communities: '-42' },
      { communities: '1e3' },
      { communities: '42,' },
      { communities: Array(101).fill('42').join(',') },
      { enabled: true, communities: '' },
      { attachments: 'https://vk.com/audio-1_23' },
      { attachments: 'audio0_1' },
      { attachments: 'photo1_0' },
      { attachments: 'audio-1_23_secret?key' },
      { messages: 'No marker' },
      { messages: Array(21).fill(defaults.messages).join('\n') },
      { restrictedMessage: 'No marker' },
      { limit: 101 },
      { replaceOwned: 'yes' },
    ]) {
      await assert.rejects(policy.save(store, { ...defaults, ...input }));
    }
    await policy.save(store, { ...defaults, limit: 0 });
    assert.equal((await job.preview()).plan.items[0].reason, 'runLimit');
    assert.equal((await runWall(job)).last.status, 'confirmed');
    assert.equal(adapter.effects.length, 0);
  });
});
test('new native post is acknowledged durably before deletion of only reviewed owned posts', async () => {
  let storeRef;
  const adapter = wallAdapter({
    response: async (step) => {
      const journal = await storeRef.get(wallLedgerId(1, 42));
      assert.equal(journal.status, 'pending');
      if (step.action === 'delete') {
        assert.ok(journal.postId > 0);
        assert.equal(adapter.walls.get(42)[0].id, journal.postId);
      }
      return 'confirmed';
    },
  });
  await withWallJob(
    async ({ job, store }) => {
      storeRef = store;
      const { plan } = await job.preview();
      const item = plan.items[0];
      assert.equal(item.reason, 'eligible');
      assert.equal(item.old.length, 1);
      assert.deepEqual(item.attachments, ['audio-1_23']);
      assert.equal(adapter.effects.length, 0);
      const result = await job.run({ planId: plan.planId, confirm: true });
      assert.equal(result.last.status, 'confirmed');
      assert.deepEqual(
        adapter.effects.map((s) => s.action),
        ['post', 'delete']
      );
      assert.equal(adapter.effects[1].postId, item.old[0].id);
      assert.equal(adapter.effects[0].attachments, 'audio-1_23');
      const ledger = await store.get(wallLedgerId(1, 42));
      assert.equal(ledger.status, 'confirmed');
      assert.deepEqual(ledger.deleted, [item.old[0].id]);
      const remaining = adapter.walls.get(42);
      assert.ok(remaining.some((p) => p.text.endsWith('foreign invitation')));
      assert.ok(remaining.some((p) => p.text.endsWith('undeletable')));
      assert.equal((await job.preview()).plan.items[0].reason, 'visible');
      await runWall(job);
      assert.equal(adapter.effects.length, 2);
    },
    { adapter, settings: { replaceOwned: true } }
  );
});
test('native current avatar, optional access key fallback, restricted content and nonrepeating variants survive review', async () => {
  for (const fallback of [false, true]) {
    const adapter = wallAdapter({
      communities: [42, 43],
      methods: fallback
        ? {
            'photos.getById': () => ({
              error: {
                error_code: 15,
                error_msg: 'Optional photo metadata refused',
              },
            }),
          }
        : {},
    });
    await withWallJob(
      async ({ job, store, policy }) => {
        const first = await job.preview();
        const [normal, restricted] = first.plan.items;
        const avatar = fallback ? 'photo1_75' : 'photo1_75_fixtureKey';
        assert.deepEqual(normal.attachments, [avatar, 'audio-1_23']);
        assert.equal(restricted.text, 'Add me as a friend: restricted');
        assert.deepEqual(restricted.attachments, [avatar]);
        assert.equal(
          (await job.run({ planId: first.plan.planId, confirm: true })).last
            .status,
          'confirmed'
        );
        for (let index = 0; index < 10; index++) {
          adapter.addPost(42, `Later ${index}`, { from_id: 2 });
        }
        assert.equal((await job.preview()).plan.items[0].reason, 'cooldown');
        await policy.save(store, {
          ...(await policy.settings(store)),
          cooldownDays: 1,
        });
        const later = wallJob(store, adapter, {
          now: () => cancelledNow + 86400001,
        });
        try {
          const second = await later.preview();
          assert.equal(second.plan.items[0].reason, 'eligible');
          assert.notEqual(second.plan.items[0].text, normal.text);
        } finally {
          await later.stop();
        }
      },
      {
        adapter,
        settings: {
          communities: '42,43',
          messages: 'Add me as a friend: one\nAdd me as a friend: two',
          restrictedCommunities: '43',
          restrictedMessage: 'Add me as a friend: restricted',
          activeAvatar: true,
        },
      }
    );
  }
});
test('protected communities, consent, visible own invitations and future history hold without writes', async () => {
  for (const change of ['protected', 'consent', 'visible', 'future']) {
    await withWallJob(async ({ job, store, adapter, policy }) => {
      if (change === 'protected') {
        await policy.save(store, {
          ...(await policy.settings(store)),
          priorityIds: [42],
        });
      }
      if (change === 'consent') {
        await saveSettings(store, { optOut: [{ source: 'vk', chat: '-42' }] });
      }
      if (change === 'visible') {
        adapter.addPost(42, 'Add me as a friend: visible');
      }
      if (change === 'future') {
        adapter.walls.get(42)[0].date = cancelledNow / 1000 + 1;
      }
      assert.notEqual(
        (await job.preview()).plan.items[0].reason,
        'eligible',
        change
      );
      await runWall(job);
      assert.equal(adapter.effects.length, 0, change);
    });
  }
});
test('definite post refusal never deletes; lost and unconfirmed post receipts are retained without replay', async () => {
  for (const mode of ['refused', 'unknown', 'unconfirmed']) {
    await withWallJob(
      async ({ job, adapter, store }) => {
        adapter.mode(mode);
        const result = await runWall(job);
        assert.equal(
          result.last.status,
          mode === 'refused' ? 'refused' : 'unknown'
        );
        assert.deepEqual(
          adapter.effects.map((s) => s.action),
          ['post']
        );
        assert.equal(
          (await store.get(wallLedgerId(1, 42))).status,
          result.last.status
        );
        if (mode !== 'refused') {
          adapter.mode('confirmed');
          assert.equal((await job.preview()).plan.items[0].reason, 'unknown');
          await runWall(job);
          assert.equal(adapter.effects.length, 1);
        }
      },
      { settings: { replaceOwned: true } }
    );
  }
});
test('durable causal reopen reviews remaining owned deletions without reposting after definite partial replacement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vk-wall-'));
  let store;
  let job;
  try {
    const path = join(directory, 'state.lino');
    store = withCausalWrites(await createLinoTextStore(path));
    const adapter = wallAdapter({
      response: (_step, n) => (n === 2 ? 'refused' : 'confirmed'),
    });
    await wallPolicy.save(store, {
      ...(await wallPolicy.settings(store)),
      communities: '42',
      replaceOwned: true,
      enabled: true,
    });
    job = wallJob(store, adapter);
    assert.equal((await runWall(job)).last.status, 'refused');
    const partial = await store.get(wallLedgerId(1, 42));
    assert.equal(partial.status, 'partial');
    assert.ok(partial.postId > 0);
    await job.stop();
    await store.close();
    store = withCausalWrites(await createLinoTextStore(path));
    job = wallJob(store, adapter, { now: () => cancelledNow + 3600001 });
    assert.equal(
      (await job.run({ scheduled: true })).plan.items[0].reason,
      'manualReview'
    );
    assert.equal(adapter.effects.length, 2);
    const { plan } = await job.preview();
    assert.equal(plan.items[0].resumed, true);
    assert.equal(plan.items[0].reason, 'eligible');
    assert.equal(plan.items[0].postId, partial.postId);
    assert.equal(
      (await job.run({ planId: plan.planId, confirm: true })).last.status,
      'confirmed'
    );
    assert.deepEqual(
      adapter.effects.map((s) => s.action),
      ['post', 'delete', 'delete']
    );
    assert.equal(adapter.effects[1].postId, adapter.effects[2].postId);
  } finally {
    await job?.stop();
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test('incomplete, duplicate or over-cap provider wall evidence and avatar mismatches refuse review', async () => {
  for (const [method, answer] of [
    ['wall.get', { count: 10, items: [] }],
    ['wall.get', { count: -1, items: [] }],
    ['wall.search', { count: 1001, items: [] }],
    ['photos.getById', [{ owner_id: 2, id: 75 }]],
    ['users.get', [{ id: 1, deactivated: 'deleted' }]],
  ]) {
    const adapter = wallAdapter({ methods: { [method]: () => answer } });
    await withWallJob(
      async ({ job }) => {
        await assert.rejects(job.preview(), /Incomplete/);
        assert.equal(adapter.effects.length, 0);
      },
      { adapter, settings: { replaceOwned: true, activeAvatar: true } }
    );
  }
});
test('community refusals persist a daily hold and account backoff survives fresh manual review', async () => {
  for (const code of [10, 14, 15, 210, 219]) {
    let now = cancelledNow;
    const adapter = wallAdapter({ communities: [42, 43], refusedCode: code });
    await withWallJob(
      async ({ job, policy, store }) => {
        adapter.mode('refused');
        assert.equal((await runWall(job)).last.status, 'refused');
        adapter.mode('confirmed');
        const paused = (await job.preview()).plan.items;
        assert.equal(
          paused[0].reason,
          [15, 210, 219].includes(code) ? 'communityPaused' : 'providerBackoff'
        );
        assert.equal(paused[1].reason, 'providerBackoff');
        await runWall(job);
        assert.equal(adapter.effects.length, 1);
        now += 60001;
        const review = await job.preview();
        assert.equal(review.plan.items[1].reason, 'eligible');
        if ([15, 210, 219].includes(code)) {
          assert.equal(review.plan.items[0].reason, 'communityPaused');
          now = cancelledNow + 86400001;
          assert.equal((await job.preview()).plan.items[0].reason, 'eligible');
        }
        assert.equal((await policy.settings(store)).enabled, false);
      },
      { adapter, settings: { communities: '42,43' }, now: () => now }
    );
  }
});
