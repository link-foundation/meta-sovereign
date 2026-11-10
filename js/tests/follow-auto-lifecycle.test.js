import test from 'node:test';
import assert from 'node:assert/strict';
import { followAutoFixture } from './helpers/follow-auto.mjs';
import { createFollowBacklinks } from '../src/follow/backlinks.js';
import { createFollowVkJoining } from '../src/follow/join-vk.js';
import { createFollowVkCalls } from '../src/follow/vk-calls.js';
import { createVkLive } from '../src/sources/vk.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { readFollowingLinks } from '../src/follow/auto-preview.js';
import { backlinkConfig } from '../src/follow/backlink-shape.js';
import { extractFollowInvites } from '../src/follow/incoming-links.js';

const joins = (f) =>
  f.joiningCalls.filter((c) => c.method === 'messages.joinChatByInviteLink');
const sends = (f) => f.vk.calls.filter((c) => c.method === 'messages.send');
const vkInput = { backlink: 'https://vk.me/join/own_invite' };
const runReview = async (f, plan) => {
  const job = await f.service.apply({ planId: plan.planId, confirm: true });
  await f.service.idle();
  return f.service.status({ jobId: job.id });
};
test('scan caps disclose omitted fields and reject malformed provider link scopes before any join', async () => {
  assert.equal(
    extractFollowInvites(
      Array.from({ length: 129 }, () => 'ordinary text'),
      'telegram'
    ).limited,
    true
  );
  assert.equal(
    extractFollowInvites(
      Array.from({ length: 129 }, () => 'ordinary text'),
      'vk'
    ).limited,
    true
  );
  const config = backlinkConfig({
    chats: ['2000000007'],
    backlink: 'https://t.me/study_group',
    autoFollow: {},
  });
  for (const links of [
    [null],
    [{ url: 'https://vk.me/join/first_invite', messageId: '1' }],
    [{ url: 'https://t.me/study_first', messageId: '0' }],
    Array.from({ length: 2 }, () => ({
      url: 'https://t.me/study_first',
      messageId: '1',
    })),
  ]) {
    await assert.rejects(
      readFollowingLinks(
        { links: async () => ({ links, limited: false, scanned: 2 }) },
        config,
        '2000000007'
      ),
      { code: 'provider-response' }
    );
  }
});
test('a changed following account or resolved target pauses before target or source writes', async () => {
  for (const change of ['owner', 'target']) {
    const f = await followAutoFixture();
    try {
      const plan = await f.service.preview(f.input(vkInput));
      if (change === 'owner') {
        f.joiningState.owner = 8;
      } else {
        f.joiningState.localIds.set('https://vk.me/join/own_invite', 99);
      }
      const result = await runReview(f, plan);
      assert.equal(result.status, 'paused');
      assert.equal(
        result.failure.code,
        change === 'owner' ? 'account-changed' : 'target-changed'
      );
      assert.equal(joins(f).length + sends(f).length, 0);
    } finally {
      await f.close();
    }
  }
});
test('source identity changes during its final conversation read block automatic target joins', async () => {
  const f = await followAutoFixture();
  try {
    const plan = await f.service.preview(f.input());
    f.state.vkResponse = (call, answer) => {
      if (call.method === 'messages.getConversationsById') {
        f.vk.state.owner = 8;
      }
      return answer;
    };
    const result = await runReview(f, plan);
    assert.equal(result.status, 'paused');
    assert.equal(result.failure.code, 'account-changed');
    assert.equal(f.member.writes.length + sends(f).length, 0);
  } finally {
    await f.close();
  }
});
test('cancellation during Telegram target resolution prevents membership, preference and backlink writes', async () => {
  const f = await followAutoFixture();
  try {
    const plan = await f.service.preview(f.input());
    let targets = 0;
    f.member.state.beforeEntity = async () => {
      // own-link read, link review, phase prepare, final resolution.
      if (++targets === 4) {
        await f.service.cancel({ jobId: current.id });
      }
    };
    const current = await f.service.apply({
      planId: plan.planId,
      confirm: true,
    });
    await f.service.idle();
    const result = await f.service.status({ jobId: current.id });
    assert.equal(result.status, 'paused');
    assert.equal(
      result.rows[0].following.links[0].result.results[0].code,
      'cancelled'
    );
    assert.equal(f.member.writes.length + sends(f).length, 0);
  } finally {
    await f.close();
  }
});
test('a confirmed join with unconfirmed preferences prevents posting and resumes without repeating membership', async () => {
  const f = await followAutoFixture();
  try {
    let fail = true;
    f.member.state.reply = (r) => {
      if (r.className === 'channels.JoinChannel') {
        f.member.state.member = true;
        return {
          className: 'messages.ChatInviteJoinResultOk',
          updates: {
            className: 'Updates',
            chats: [f.member.state.entity],
            users: [],
            updates: [],
          },
        };
      }
      if (r.className === 'account.UpdateNotifySettings' && fail) {
        throw Object.assign(new Error('fixture'), {
          errorMessage: 'CHAT_ADMIN_REQUIRED',
          code: 400,
        });
      }
      if (r.className === 'account.UpdateNotifySettings') {
        f.member.state.muted = true;
        return true;
      }
      f.member.state.archived = true;
      return {
        className: 'Updates',
        chats: [f.member.state.entity],
        users: [],
        updates: [],
      };
    };
    const first = await f.post();
    assert.equal(first.status, 'paused');
    assert.equal(first.failure.code, 'follow-incomplete');
    assert.equal(
      first.rows[0].following.links[0].result.results[0].status,
      'confirmed'
    );
    assert.equal(sends(f).length, 0);
    fail = false;
    await f.service.resume({ jobId: first.id, confirm: true });
    await f.service.idle();
    assert.equal(
      (await f.service.status({ jobId: first.id })).status,
      'confirmed'
    );
    assert.equal(
      f.member.writes.filter((r) => r.className === 'channels.JoinChannel')
        .length,
      1
    );
  } finally {
    await f.close();
  }
});
test('an uncertain VK join remains blocked after reopening instead of replaying the request', async () => {
  const f = await followAutoFixture();
  let reopened;
  try {
    f.joiningState.response = (method, params, answer) => {
      if (method === 'messages.joinChatByInviteLink') {
        f.joiningState.members.delete(params.link);
        throw new Error('fixture lost response');
      }
      return answer;
    };
    const first = await f.post(vkInput);
    assert.equal(first.status, 'paused');
    assert.equal(first.rows[0].following.links[0].status, 'unknown');
    assert.equal(joins(f).length, 1);
    reopened = createFollowBacklinks(f.options);
    await reopened.resume({ jobId: first.id, confirm: true });
    await reopened.idle();
    assert.equal((await reopened.status({ jobId: first.id })).status, 'paused');
    assert.equal(joins(f).length, 1);
    assert.equal(sends(f).length, 0);
  } finally {
    await reopened?.stop();
    await f.close();
  }
});
test('VK join readback retries only timeouts without reissuing the membership write', async () => {
  const f = await followAutoFixture();
  let attempts = 0;
  try {
    f.joiningState.before = (method, params) => {
      if (
        method === 'messages.getChatPreview' &&
        params.link.includes('first_invite') &&
        joins(f).length &&
        ++attempts < 3
      ) {
        throw Object.assign(new Error('fixture'), { code: 'ETIMEDOUT' });
      }
    };
    const result = await f.post(vkInput);
    assert.equal(result.status, 'confirmed', JSON.stringify(result));
    assert.equal(attempts, 3);
    assert.equal(joins(f).length, 1);
  } finally {
    await f.close();
  }
});
test('missing current VK membership, malformed join receipts and failed readback never become positive results', async () => {
  for (const mode of ['missing-member', 'missing-id', 'missing-readback']) {
    const f = await followAutoFixture();
    try {
      f.joiningState.response = (method, params, answer) => {
        if (mode === 'missing-member' && method === 'messages.getChatPreview') {
          delete answer.preview.is_member;
        }
        if (
          mode === 'missing-id' &&
          method === 'messages.joinChatByInviteLink'
        ) {
          return {};
        }
        if (
          mode === 'missing-readback' &&
          method === 'messages.getChatPreview' &&
          joins(f).length &&
          params.link.includes('first_invite')
        ) {
          answer.preview.is_member = false;
        }
        return answer;
      };
      if (mode === 'missing-member') {
        await assert.rejects(f.service.preview(f.input(vkInput)), {
          code: 'provider-response',
        });
      } else {
        assert.equal((await f.post(vkInput)).status, 'paused');
      }
      assert.equal(sends(f).length, 0);
      assert.equal(joins(f).length, mode === 'missing-member' ? 0 : 1);
    } finally {
      await f.close();
    }
  }
});
test('zero additional retries stops after one removed post while an empty scan still permits reviewed posting', async () => {
  const f = await followAutoFixture();
  try {
    f.state.links = 'No incoming invite';
    f.vk.state.removed = true;
    const result = await f.post({ autoFollow: { maxRetries: 0 } });
    assert.equal(result.status, 'rejected');
    assert.equal(result.completion, 'retry-limit');
    assert.equal(result.rows[0].following.links.length, 0);
    assert.equal(f.member.writes.length, 0);
    assert.equal(sends(f).length, 1);
  } finally {
    await f.close();
  }
});
test('the real VK single-call path checks cancellation and changed credentials after the limiter', async () => {
  for (const changed of [false, true]) {
    const store = createMemoryStore();
    await store.put({
      id: 'secret:vk:access-token',
      token: 'fixture-placeholder',
    });
    let cancelled = false;
    let fetched = 0;
    const { call } = await createFollowVkCalls({
      store,
      liveFactory: (options) =>
        createVkLive({
          ...options,
          limiter: {
            wait: async () => {
              if (changed) {
                await store.put({
                  id: 'secret:vk:access-token',
                  token: 'different-fixture-placeholder',
                });
              } else {
                cancelled = true;
              }
            },
          },
          fetchImpl: async () => {
            fetched++;
            return new globalThis.Response('{}');
          },
        }),
    });
    await assert.rejects(
      call('messages.send', { peer_id: 2000000007, message: 'fixture' }, true, {
        cancelled: () => cancelled,
      }),
      { code: changed ? 'account-changed' : 'cancelled' }
    );
    assert.equal(fetched, 0);
  }
});
test('standalone VK joining rejects malformed invite URLs before resolving an account', async () => {
  const f = await followAutoFixture();
  try {
    const joiner = await createFollowVkJoining({
      store: f.vk.store,
      liveFactory: () => ({
        callOnce: () => {
          throw new Error('unexpected provider call');
        },
      }),
    });
    await assert.rejects(joiner.preview('https://t.me/study_first'), {
      code: 'bad-request',
    });
  } finally {
    await f.close();
  }
});
test('only removed conversations are rescanned and reposted in a mixed multi-chat run', async () => {
  const f = await followAutoFixture();
  try {
    f.state.vkResponse = (call, answer) =>
      call.method === 'messages.getById' && call.params.message_ids === '100'
        ? { items: [] }
        : answer;
    const result = await f.post({ chats: ['2000000007', '2000000008'] });
    assert.equal(result.status, 'confirmed', JSON.stringify(result));
    assert.equal(result.rows[0].round, 1);
    assert.equal(result.rows[1].round, undefined);
    assert.deepEqual(
      sends(f).map((c) => c.params.peer_id),
      ['2000000007', '2000000008', '2000000007']
    );
    assert.deepEqual(
      f.vk.calls
        .filter(
          (c) => c.method === 'messages.getHistory' && c.params.count === '200'
        )
        .map((c) => c.params.peer_id),
      ['2000000007', '2000000008', '2000000007']
    );
    assert.equal(
      f.member.writes.filter((r) => r.className === 'channels.JoinChannel')
        .length,
      1
    );
  } finally {
    await f.close();
  }
});
test(
  'stop owns an in-flight VK join and persists uncertainty without issuing a backlink',
  { timeout: 5000 },
  async () => {
    const f = await followAutoFixture();
    let enter;
    let release;
    const entered = new Promise((resolve) => {
      enter = resolve;
    });
    const released = new Promise((resolve) => {
      release = resolve;
    });
    let stopping;
    try {
      const plan = await f.service.preview(f.input(vkInput));
      f.joiningState.before = async (method) => {
        if (method === 'messages.joinChatByInviteLink') {
          enter();
          await released;
        }
      };
      const queued = await f.service.apply({
        planId: plan.planId,
        confirm: true,
      });
      await entered;
      let settled = false;
      stopping = f.service.stop().then(() => {
        settled = true;
      });
      await new Promise((resolve) => globalThis.setImmediate(resolve));
      assert.equal(settled, false);
      release();
      await stopping;
      const saved = await f.vk.store.get(queued.id);
      assert.equal(saved.status, 'paused');
      assert.equal(saved.rows[0].following.links[0].status, 'unknown');
      assert.equal(
        saved.rows[0].following.links[0].result.results[0].chat,
        '2000000008'
      );
      assert.equal(joins(f).length, 1);
      assert.equal(sends(f).length, 0);
    } finally {
      release();
      await stopping;
      await f.close();
    }
  }
);
test('a refusal during VK membership readback preserves the accepted join as uncertain', async () => {
  const f = await followAutoFixture();
  try {
    f.joiningState.before = (method, params) => {
      if (
        method === 'messages.getChatPreview' &&
        params.link.includes('first_invite') &&
        joins(f).length
      ) {
        throw Object.assign(new Error('fixture readback denied'), {
          vkCode: 15,
        });
      }
    };
    const first = await f.post(vkInput);
    const phase = first.rows[0].following.links[0].result.results[0];
    assert.equal(first.status, 'paused');
    assert.equal(phase.status, 'unknown');
    assert.equal(phase.providerCode, 15);
    assert.equal(phase.chat, '2000000008');
    f.joiningState.members.delete('https://vk.me/join/first_invite');
    delete f.joiningState.before;
    await f.service.resume({ jobId: first.id, confirm: true });
    await f.service.idle();
    assert.equal(
      (await f.service.status({ jobId: first.id })).status,
      'paused'
    );
    assert.equal(joins(f).length, 1);
    assert.equal(sends(f).length, 0);
  } finally {
    await f.close();
  }
});
