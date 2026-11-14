import test from 'node:test';
import assert from 'node:assert/strict';
import { followTelegramFixture } from './helpers/follow-telegram.mjs';
import { followChatsFixture } from './helpers/follow-chats.mjs';
import { createFollowTelegram } from '../src/sources/telegram-follow.js';
import { createFollowDiscovery } from '../src/follow/chat-discovery.js';

const timeout = () =>
  Object.assign(new Error('private diagnostic'), { code: 'ETIMEDOUT' });
const policy = { attempts: 3, delayMs: 0, maxDelayMs: 0 };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('standalone Telegram retries each read within the reviewed budget and never retries a write', async () => {
  const f = followTelegramFixture();
  let attempts = 0;
  f.state.read = (request) => {
    if (request.className === 'messages.GetDialogs' && ++attempts < 3) {
      throw timeout();
    }
  };
  assert.equal(
    (await f.actions.followTelegramList({ retry: policy })).ok,
    true
  );
  assert.equal(attempts, 3);
  const plan = await f.actions.followTelegramPreview({
    target: 'study_group',
    mute: true,
    retry: policy,
  });
  assert.deepEqual(plan.retry, policy);
  f.state.reply = () => {
    throw timeout();
  };
  const result = await f.actions.followTelegramApply({
    planId: plan.planId,
    confirm: true,
  });
  assert.equal(result.results[1].status, 'unknown');
  assert.equal(f.writes.length, 1);
});

test('invalid Telegram retry settings are rejected before client or provider access', async () => {
  const f = followTelegramFixture();
  for (const retry of [
    { attempts: 0 },
    { attempts: '3' },
    { delayMs: 300001 },
    { delayMs: 10, maxDelayMs: 1 },
  ]) {
    assert.equal(
      (await f.actions.followTelegramList({ retry })).code,
      'bad-request'
    );
    assert.equal(
      (await f.actions.followTelegramPreview({ target: 'study_group', retry }))
        .code,
      'bad-request'
    );
  }
  assert.equal(f.calls.length, 0);
});

test(
  'Telegram cancellation interrupts retry backoff and stop drains an issued read',
  { timeout: 3000 },
  async () => {
    const f = followTelegramFixture();
    const sleeping = deferred();
    const actions = createFollowTelegram(f.env, f.context, {
      sleep: async (_ms, signal) => {
        sleeping.resolve();
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
      },
    });
    f.state.read = () => {
      throw timeout();
    };
    const request = actions.followTelegramList();
    await sleeping.promise;
    await actions.followTelegramCancel();
    assert.equal((await request).code, 'cancelled');
    const issued = deferred();
    const answer = deferred();
    f.state.read = async () => {
      issued.resolve();
      return answer.promise;
    };
    const pending = actions.followTelegramList();
    await issued.promise;
    let stopped = false;
    const closing = f.env.followTelegramStop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    assert.equal(stopped, false);
    answer.resolve({
      className: 'Dialogs',
      dialogs: [],
      chats: [],
      messages: [],
    });
    assert.equal((await pending).code, 'stopped');
    await closing;
  }
);

test('VK discovery uses single-attempt reads and bounded timeout retries without retrying refusals', async () => {
  const f = await followChatsFixture();
  const attempts = [];
  const discovery = createFollowDiscovery({
    store: f.store,
    liveFactory: () => ({
      call: () => {
        assert.fail('hidden general-purpose retry path');
      },
      callOnce: async (method, params, options) => {
        attempts.push({ method, params, options });
        assert.equal(options.write, false);
        await options.beforeIssue();
        if (attempts.length < 3) {
          throw timeout();
        }
        return { count: 0, items: [] };
      },
    }),
  });
  assert.equal((await discovery.chats({ retry: policy })).page.complete, true);
  assert.equal(attempts.length, 3);
  for (const vkCode of [6, 14, 917]) {
    let calls = 0;
    const refused = createFollowDiscovery({
      store: f.store,
      liveFactory: () => ({
        callOnce: async () => {
          calls++;
          throw Object.assign(timeout(), { vkCode });
        },
      }),
    });
    await assert.rejects(refused.chats({ retry: policy }), { vkCode });
    assert.equal(calls, 1);
    await refused.stop();
  }
  await discovery.stop();
});

test(
  'VK cancellation is scoped, wakes backoff, and shutdown retains ownership of issued requests',
  { timeout: 3000 },
  async () => {
    const f = await followChatsFixture();
    const sleeping = deferred();
    const issued = deferred();
    const answer = deferred();
    let calls = 0;
    const discovery = createFollowDiscovery({
      store: f.store,
      sleep: async (_ms, signal) => {
        sleeping.resolve();
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
      },
      liveFactory: () => ({
        callOnce: async () => {
          if (++calls === 1) {
            throw timeout();
          }
          issued.resolve();
          return answer.promise;
        },
      }),
    });
    const first = discovery.chats({ requestId: 'first' });
    await sleeping.promise;
    const second = discovery.chats({ requestId: 'second' });
    await issued.promise;
    await discovery.cancel({ requestId: 'first' });
    await assert.rejects(first, { code: 'cancelled' });
    let stopped = false;
    const closing = discovery.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    assert.equal(stopped, false);
    answer.resolve({ count: 0, items: [] });
    await assert.rejects(second, { code: 'stopped' });
    await closing;
    assert.equal(calls, 2);
    await assert.rejects(discovery.chats(), { code: 'stopped' });
  }
);

test(
  'Telegram cancellation selects one read without disturbing another preview',
  { timeout: 3000 },
  async () => {
    const f = followTelegramFixture();
    const sleeping = deferred();
    const actions = createFollowTelegram(f.env, f.context, {
      sleep: async (_ms, signal) => {
        sleeping.resolve();
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
      },
    });
    f.state.read = (request) => {
      if (request.className === 'messages.GetDialogs') {
        throw timeout();
      }
    };
    const first = actions.followTelegramList({ requestId: 'first' });
    await sleeping.promise;
    const second = actions.followTelegramPreview({
      target: 'study_group',
      requestId: 'second',
    });
    await actions.followTelegramCancel({ requestId: 'first' });
    assert.equal((await first).code, 'cancelled');
    assert.equal((await second).ok, true);
    await f.env.followTelegramStop();
  }
);

test('production VK transport never retries provider refusals and checks credentials after pacing', async () => {
  const f = await followChatsFixture();
  let calls = 0;
  const discovery = createFollowDiscovery({
    store: f.store,
    limiter: { wait: async () => {} },
    fetchImpl: async () => {
      calls++;
      return new globalThis.Response(
        JSON.stringify({
          error: { error_code: 6, error_msg: 'private diagnostic' },
        })
      );
    },
  });
  await assert.rejects(discovery.chats({ retry: policy }), { vkCode: 6 });
  assert.equal(calls, 1);
  await discovery.stop();
  const waiting = deferred();
  const release = deferred();
  const paced = createFollowDiscovery({
    store: f.store,
    limiter: {
      wait: async () => {
        waiting.resolve();
        await release.promise;
      },
    },
    fetchImpl: () => {
      assert.fail('changed credentials must prevent issue');
    },
  });
  const pending = paced.chats();
  await waiting.promise;
  await f.store.put({
    id: 'secret:vk:access-token',
    token: 'rotated-placeholder',
  });
  release.resolve();
  await assert.rejects(pending, { code: 'account-changed' });
  await paced.stop();
});
