import test from 'node:test';
import assert from 'node:assert/strict';
import { followAutoFixture } from './helpers/follow-auto.mjs';
import { backlinkConfig } from '../src/follow/backlink-shape.js';
import { backlinkJobReceipt } from '../src/web/follow-backlink-receipt.js';
import { extractFollowInvites } from '../src/follow/incoming-links.js';
import { createFollowBacklinks } from '../src/follow/backlinks.js';

test('automatic follow configuration remains opt in and rejects excessive or unsupported policy', () => {
  const base = { chats: ['2000000007'], backlink: 'https://t.me/study_group' };
  assert.equal(backlinkConfig(base).autoFollow, undefined);
  for (const autoFollow of [
    true,
    [],
    { maxRetries: 11 },
    { maxLinks: 101 },
    { joinDelayMs: -1 },
    { mute: 'true' },
  ]) {
    assert.throws(() => backlinkConfig({ ...base, autoFollow }), {
      code: 'bad-request',
    });
  }
  assert.throws(
    () =>
      backlinkConfig({
        ...base,
        backlink: 'https://vk.me/join/own_invite',
        autoFollow: { mute: true },
      }),
    { code: 'preferences-unavailable' }
  );
});
test('bounded link extraction excludes message URLs, malformed VK suffixes and duplicates', () => {
  assert.deepEqual(
    extractFollowInvites(
      [
        'https://vk.me/join/first_invite https://vk.me/join/first_invite https://vk.me/join/secret_invite/extra https://vk.me/join/secret_invite?key=1',
      ],
      'vk'
    ).links.map((link) => link.url),
    ['https://vk.me/join/first_invite']
  );
  assert.deepEqual(
    extractFollowInvites(
      [
        'https://t.me/study_first/7 https://t.me/c/7/1 https://t.me/study_first',
      ],
      'telegram'
    ).links.map((link) => link.url),
    ['https://t.me/study_first']
  );
});
for (const source of ['vk', 'telegram']) {
  for (const target of ['vk', 'telegram']) {
    test(`reviewed ${source} to ${target} automatically follows incoming links before positive posting and monitoring`, async () => {
      const f = await followAutoFixture();
      try {
        const body = f.input({
          source,
          chats: [source === 'vk' ? '2000000007' : '-7'],
          backlink:
            target === 'vk'
              ? 'https://vk.me/join/own_invite'
              : 'https://t.me/study_group',
        });
        const plan = await f.service.preview(body);
        assert.equal(plan.rows[0].following.links.length, 1);
        assert.equal(
          f.member.writes.length +
            f.joiningCalls.filter(
              (call) => call.method === 'messages.joinChatByInviteLink'
            ).length,
          0
        );
        assert.equal(plan.followingAccount.owner, '7');
        const queued = await f.service.apply({
          planId: plan.planId,
          confirm: true,
        });
        await f.service.idle();
        const job = await f.service.status({ jobId: queued.id });
        assert.equal(job.status, 'confirmed', JSON.stringify(job));
        assert.equal(job.rows[0].following.links[0].status, 'confirmed');
        assert.equal(backlinkJobReceipt(job), true);
        if (target === 'telegram') {
          assert.equal(f.states.get('study_first').member, true);
          assert.equal(f.states.get('study_first').muted, true);
          assert.equal(f.states.get('study_first').archived, true);
          assert.equal(f.states.get('study_second').member, false);
        } else {
          assert.equal(
            f.joiningState.members.has('https://vk.me/join/first_invite'),
            true
          );
          assert.equal(
            f.joiningCalls.filter(
              (call) => call.method === 'messages.joinChatByInviteLink'
            ).length,
            1
          );
        }
      } finally {
        await f.close();
      }
    });
  }
}
test('only rejected chats get fresh scans and a distinct post key; prior receipts survive convergence', async () => {
  const f = await followAutoFixture();
  f.state.vkResponse = (call, answer) => {
    if (
      call.method === 'messages.getById' &&
      call.params.message_ids === '100'
    ) {
      f.state.links = 'https://t.me/study_second';
      return { items: [] };
    }
    return answer;
  };
  try {
    const job = await f.post();
    assert.equal(job.status, 'confirmed', JSON.stringify(job));
    assert.equal(job.rows[0].round, 1);
    assert.equal(job.rows[0].attempts[0].messageId, '100');
    assert.equal(job.rows[0].messageId, '101');
    assert.equal(f.states.get('study_second').member, true);
    const sends = f.vk.calls.filter((call) => call.method === 'messages.send');
    assert.equal(sends.length, 2);
    assert.notEqual(sends[0].params.random_id, sends[1].params.random_id);
    assert.equal(backlinkJobReceipt(job), true);
  } finally {
    await f.close();
  }
});
test('retry exhaustion and wait notices preserve removed results without false success', async () => {
  for (const notice of [false, true]) {
    const f = await followAutoFixture();
    f.vk.state.removed = true;
    f.vk.state.skipNotice = notice;
    try {
      const job = await f.post();
      assert.equal(job.status, 'rejected');
      assert.equal(job.completion, notice ? 'wait-notice' : 'retry-limit');
      assert.equal(
        f.vk.calls.filter((call) => call.method === 'messages.send').length,
        notice ? 1 : 3
      );
      assert.equal(backlinkJobReceipt(job), true);
    } finally {
      await f.close();
    }
  }
});
test('an uncertain source post stops automatic iteration and survives a reopened controller', async () => {
  const f = await followAutoFixture();
  f.state.vkResponse = (call, answer) => {
    if (call.method === 'messages.send') {
      throw new Error('fixture response lost');
    }
    return answer;
  };
  let reopened;
  try {
    const first = await f.post();
    assert.equal(first.status, 'unknown');
    reopened = createFollowBacklinks(f.options);
    const plan = await reopened.preview(f.input());
    const job = await reopened.apply({ planId: plan.planId, confirm: true });
    await reopened.idle();
    assert.equal((await reopened.status({ jobId: job.id })).status, 'unknown');
    assert.equal(
      f.vk.calls.filter((call) => call.method === 'messages.send').length,
      1
    );
  } finally {
    await reopened?.stop();
    await f.close();
  }
});
