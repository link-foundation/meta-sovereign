import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { wallPolicy } from '../src/automation/vk-wall-settings.js';
import { evidenceHash } from '../src/automation/vk-reengage-evidence.js';
import {
  withWallJob,
  wallAdapter,
  wallJob,
} from '../../experiments/issue-56/vk-wall-fixture.mjs';

test('optional single-media choice preserves legacy saved wall policies and rejects malformed choices', async () => {
  const store = createMemoryStore();
  const original = await wallPolicy.settings(store);
  assert.equal(original.randomAttachment, false);
  const legacy = { ...original };
  delete legacy.randomAttachment;
  delete legacy.holdAnyVisible;
  await store.put({ id: wallPolicy.keys.job, ...legacy });
  assert.deepEqual(await wallPolicy.settings(store), original);
  assert.deepEqual((await wallPolicy.save(store, legacy)).settings, original);
  for (const value of [null, 'true', 1, undefined]) {
    await assert.rejects(
      wallPolicy.save(store, { ...original, randomAttachment: value })
    );
  }
});

test('single-media choice freezes one native item with avatar, while restricted communities omit the pool', async () => {
  const media = ['audio-1_23', 'audio-1_24', 'photo1_25_fixtureKey'];
  const adapter = wallAdapter({ communities: [42, 43] });
  await withWallJob(
    async ({ job, policy, store }) => {
      assert.equal((await policy.settings(store)).randomAttachment, true);
      const { plan } = await job.preview();
      const [normal, restricted] = plan.items;
      assert.equal(normal.attachments[0], 'photo1_75_fixtureKey');
      assert.equal(normal.attachments.length, 2);
      assert(media.includes(normal.attachments[1]));
      assert.deepEqual(restricted.attachments, ['photo1_75_fixtureKey']);
      assert.equal(adapter.effects.length, 0);
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'confirmed'
      );
      assert.deepEqual(
        adapter.effects.map((step) => step.attachments),
        [normal.attachments.join(','), 'photo1_75_fixtureKey']
      );
    },
    {
      adapter,
      settings: {
        communities: '42,43',
        restrictedCommunities: '43',
        activeAvatar: true,
        randomAttachment: true,
        attachments: media.join(','),
      },
    }
  );
});

test('empty, single, duplicate and maximum pools retain exact fixed and optional single selection', async () => {
  for (const randomAttachment of [false, true]) {
    for (const ids of [
      [],
      ['audio-1_23'],
      ['audio-1_23', 'audio-1_23'],
      Array.from({ length: 10 }, (_, index) => `audio-1_${index + 1}`),
    ]) {
      await withWallJob(
        async ({ job }) => {
          const selected = (await job.preview()).plan.items[0].attachments;
          assert.equal(
            selected.length,
            randomAttachment && ids.length ? 1 : new Set(ids).size
          );
          assert(selected.every((id) => ids.includes(id)));
        },
        { settings: { randomAttachment, attachments: ids.join(',') } }
      );
    }
  }
});

test('partial owned replacement retains the original random choice across owner restart without reposting', async () => {
  let refused = true;
  const adapter = wallAdapter({
    response: (step) =>
      step.action === 'delete' && refused ? 'refused' : 'confirmed',
  });
  await withWallJob(
    async ({ job, store }) => {
      const { plan } = await job.preview();
      const selected = [...plan.items[0].attachments];
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'refused'
      );
      await job.stop();
      refused = false;
      const reopened = wallJob(store, adapter);
      try {
        const resume = (await reopened.preview()).plan;
        assert.deepEqual(resume.items[0].attachments, selected);
        assert.equal(
          (await reopened.run({ planId: resume.planId, confirm: true })).last
            .status,
          'confirmed'
        );
        assert.deepEqual(
          adapter.effects.map((s) => s.action),
          ['post', 'delete', 'delete']
        );
        assert.equal(adapter.effects[0].attachments, selected.join(','));
      } finally {
        await reopened.stop();
      }
    },
    {
      adapter,
      settings: {
        randomAttachment: true,
        replaceOwned: true,
        attachments: 'audio-1_23,audio-1_24',
      },
    }
  );
});

test('changing the media-choice policy after review refuses publication without rerandomizing', async () => {
  await withWallJob(
    async ({ job, policy, store, adapter }) => {
      const { plan } = await job.preview();
      await policy.save(store, {
        ...(await policy.settings(store)),
        randomAttachment: false,
      });
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'refused'
      );
      assert.equal(adapter.effects.length, 0);
    },
    {
      settings: {
        randomAttachment: true,
        attachments: 'audio-1_23,audio-1_24',
      },
    }
  );
});

test('legacy fixed-media partial receipts keep their policy identity after settings upgrade', async () => {
  let refused = true;
  const adapter = wallAdapter({
    response: (step) =>
      step.action === 'delete' && refused ? 'refused' : 'confirmed',
  });
  await withWallJob(
    async ({ job, store, policy }) => {
      const { plan } = await job.preview();
      const legacy = { ...plan.settings };
      delete legacy.randomAttachment;
      delete legacy.holdAnyVisible;
      assert.equal(plan.policyIdentity, await evidenceHash(legacy));
      assert.equal(
        (await job.run({ planId: plan.planId, confirm: true })).last.status,
        'refused'
      );
      await store.put({ id: policy.keys.job, ...legacy });
      await job.stop();
      refused = false;
      const reopened = wallJob(store, adapter);
      try {
        const fresh = (await reopened.preview()).plan;
        assert.equal(fresh.items[0].reason, 'eligible');
        assert.deepEqual(fresh.items[0].attachments, [
          'audio-1_23',
          'audio-1_24',
        ]);
        assert.equal(
          (await reopened.run({ planId: fresh.planId, confirm: true })).last
            .status,
          'confirmed'
        );
        assert.deepEqual(
          adapter.effects.map((s) => s.action),
          ['post', 'delete', 'delete']
        );
      } finally {
        await reopened.stop();
      }
    },
    {
      adapter,
      settings: { replaceOwned: true, attachments: 'audio-1_23,audio-1_24' },
    }
  );
});
