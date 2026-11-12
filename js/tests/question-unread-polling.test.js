import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import { unreadNoticeFixture } from '../../experiments/issue-56/unread-notice-fixture.mjs';
import { checkUnreadReview } from '../src/automation/question-unread-state.js';
import {
  normalizeUnreadPolling,
  unreadPollingOutcome,
} from '../src/automation/question-unread-polling-state.js';
import {
  unreadInput,
  unreadPass,
  unreadReviewFixture,
} from '../../experiments/issue-56/question-unread-review-fixture.mjs';
import {
  pollingSettings,
  waitUnreadPolling,
  withPollingFixture,
  gatedPollingFixture,
  pollingCycleFixture,
} from '../../experiments/issue-56/unread-polling-fixture.mjs';

test(
  'polling owns one provider between passes, journals distinct children and Stop drains without replay',
  { timeout: 5000 },
  async () =>
    withPollingFixture(async (env, input) => {
      const initial = await env.browser.unreadStart(input);
      assert.equal(initial.state, 'active');
      await assert.rejects(env.browser.unreadStart(unreadInput()), {
        code: 'question-unread-active',
      });
      const second = await waitUnreadPolling(
        env.browser,
        input.id,
        (value) => value.polling.passes === 2
      );
      checkUnreadReview(second, input.id);
      const firstId = env.state.scans[0];
      assert.equal(env.state.scans.length, 2);
      assert.notEqual(second.polling.lastPassId, input.id);
      assert.equal(second.polling.receiptPassId, second.polling.lastPassId);
      assert.ok(firstId.signal);
      const stopped = await env.browser.unreadStop(input);
      assert.equal(stopped.state, 'stopped');
      assert.equal(stopped.owned, false);
      assert.equal(stopped.polling.reason, 'owner-stopped');
      assert.equal(
        (await env.browser.unreadStart({ id: input.id })).state,
        'stopped'
      );
      assert.equal(env.state.scans.length, 2);
      assert.equal(env.state.sends.length, 0);
      assert.equal(env.state.prefills.length, 0);
    })
);

test(
  'Stop awaits a pending native pass and exposes its receipt while stopping',
  { timeout: 5000 },
  async () =>
    gatedPollingFixture(async (env, input, release) => {
      await env.browser.unreadStart(input);
      await waitUnreadPolling(
        env.browser,
        input.id,
        () => env.state.scans.length === 1
      );
      const pending = await env.browser.unreadStatus(input);
      assert.equal(
        pending.polling.receiptPassId,
        pending.polling.pendingPassId
      );
      let settled = false;
      const stop = env.browser.unreadStop(input).then((value) => {
        settled = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 75));
      assert.equal(settled, false);
      release();
      const result = await stop;
      assert.equal(result.state, 'stopped');
      assert.equal(result.restoration.restored, true);
      assert.equal(result.polling.pendingPassId, null);
      assert.equal(env.state.scans.length, 1);
    }, pollingSettings)
);

test(
  'expiry drains and server restart recovers the saved receipt without resuming',
  { timeout: 5000 },
  async () => {
    const env = await unreadReviewFixture();
    const input = unreadInput({
      polling: { ...pollingSettings, durationMs: 1000 },
    });
    let reader;
    try {
      await env.browser.unreadStart(input);
      await waitUnreadPolling(
        env.browser,
        input.id,
        (value) => value.polling.passes === 1
      );
      reader = createQuestionBrowser({
        store: env.store,
        send: env.send,
        clock: env.clock,
      });
      const recovered = await reader.unreadStart({ id: input.id });
      assert.equal(recovered.state, 'paused');
      assert.equal(recovered.owned, false);
      assert.equal(recovered.polling.reason, 'owner-unavailable');
      assert.equal(recovered.entries.length, 1);
      checkUnreadReview(recovered, input.id);
      const expired = await waitUnreadPolling(
        env.browser,
        input.id,
        (value) => value.state === 'stopped'
      );
      assert.equal(expired.polling.reason, 'expired');
      assert.equal(env.state.scans.length, 1);
    } finally {
      await reader?.close();
      await env.browser.close();
    }
  }
);

test(
  'unverified restoration pauses polling after its first pass',
  { timeout: 5000 },
  async () =>
    withPollingFixture(
      async (env, input) => {
        await env.browser.unreadStart(input);
        const result = await waitUnreadPolling(
          env.browser,
          input.id,
          (value) => value.state === 'paused'
        );
        assert.equal(result.polling.phase, 'settled');
        assert.equal(result.restoration.restored, false);
        assert.equal(env.state.scans.length, 1);
        checkUnreadReview(result, input.id);
      },
      {
        scan: async () => ({
          ...unreadPass(),
          restoration: { restored: false, reason: 'owner-changed' },
        }),
      }
    )
);

test('poll settings reject null, coercion and unbounded values before any native read', async () => {
  const env = await unreadReviewFixture();
  try {
    for (const polling of [
      null,
      true,
      [],
      { intervalMs: null },
      { intervalMs: '1000' },
      { durationMs: 86400001 },
      { maxFailures: 11 },
      { intervalMs: 1000, retryMaxMs: 999 },
    ]) {
      await assert.rejects(env.browser.unreadStart(unreadInput({ polling })), {
        code: 'question-unread-polling-settings',
      });
    }
    assert.equal(env.state.scans.length, 0);
    assert.equal(normalizeUnreadPolling({}).durationMs, 7200000);
  } finally {
    await env.browser.close();
  }
});

test('retry policy distinguishes owner activity, empty restored failures and uncertain delivery', () => {
  const child = {
    state: 'failed',
    code: 'ETIMEDOUT',
    entries: [],
    restoration: { restored: true },
  };
  assert.equal(unreadPollingOutcome(child), 'backoff');
  assert.equal(
    unreadPollingOutcome({
      ...child,
      entries: [{ notice: { phase: 'unknown' } }],
    }),
    'settled'
  );
  assert.equal(
    unreadPollingOutcome({ ...child, restoration: { restored: false } }),
    'settled'
  );
  assert.equal(
    unreadPollingOutcome({ ...child, code: 'browser-background-owner-active' }),
    'owner-active'
  );
  assert.equal(
    unreadPollingOutcome({ code: 'question-unread-active', entries: [] }, true),
    'backoff'
  );
  assert.equal(
    unreadPollingOutcome({ ...child, code: 'unexpected' }),
    'settled'
  );
});

test(
  'polling wire validation rejects changed receipt IDs and malformed durable state',
  { timeout: 5000 },
  async () =>
    withPollingFixture(async (env, input) => {
      await env.browser.unreadStart(input);
      await waitUnreadPolling(
        env.browser,
        input.id,
        (value) => value.polling.passes === 1
      );
      const result = await env.browser.unreadStop(input);
      for (const patch of [
        { lastPassId: input.id },
        { pendingPassId: input.id },
        { receiptPassId: unreadInput().id },
        { passes: 0 },
        { failures: 4 },
        { settings: { ...pollingSettings, maxFailures: true } },
        { phase: 'completed' },
      ]) {
        assert.throws(() =>
          checkUnreadReview(
            { ...result, polling: { ...result.polling, ...patch } },
            input.id
          )
        );
      }
    })
);

test('bounded exponential backoff pauses after the configured failures without native replays', async () => {
  let attempts = 0;
  let now = 0;
  const waits = [];
  const { cycle, runtime } = pollingCycleFixture({
    settings: { ...pollingSettings, retryMaxMs: 1500 },
    clock: () => new Date(now),
    finite: {
      start() {
        attempts++;
        throw Object.assign(new Error('busy'), {
          code: 'question-unread-active',
        });
      },
    },
    pause: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  });
  await cycle.run();
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [1000, 1500]);
  assert.equal(runtime.record.state, 'paused');
  assert.equal(runtime.record.polling.failures, 3);
});

test('unexpected status failure still drains an issued child and preserves its recovery ID', async () => {
  let drains = 0;
  const { cycle, runtime } = pollingCycleFixture({
    finite: {
      start: async ({ id }) => ({ id, state: 'active' }),
      status: async () => {
        throw new Error('read failed');
      },
      stop: async () => {
        drains++;
      },
    },
    pause: async () => {},
  });
  await cycle.run();
  assert.equal(drains, 1);
  assert.equal(runtime.record.state, 'paused');
  assert.match(runtime.record.polling.pendingPassId, /^question-unread:/u);
});

test('a failed child start response is drained by its journaled ID before pausing', async () => {
  const stopped = [];
  const { cycle, runtime } = pollingCycleFixture({
    finite: {
      start: async () => {
        throw new Error('response lost after issue');
      },
      stop: async ({ id }) => {
        stopped.push(id);
        return {
          id,
          state: 'paused',
          entries: [{ chat: '8', notice: { phase: 'unknown' } }],
        };
      },
    },
  });
  await cycle.run();
  assert.ok(stopped.length >= 1);
  assert.equal(new Set(stopped).size, 1);
  assert.equal(runtime.record.polling.lastPassId, stopped[0]);
  assert.equal(runtime.record.entries[0].notice.phase, 'unknown');
  assert.equal(runtime.record.state, 'paused');
});

test(
  'unknown notice delivery pauses its polling owner and status recovery never reissues',
  { timeout: 5000 },
  async () => {
    const env = await unreadNoticeFixture({
      notices: { acknowledgements: 'reply' },
      issue: async () => ({ via: 'browser' }),
    });
    const input = { ...env.input, polling: pollingSettings };
    try {
      await env.browser.unreadStart(input);
      const result = await waitUnreadPolling(
        env.browser,
        input.id,
        (value) => value.state === 'paused'
      );
      assert.equal(result.entries[0].notice.phase, 'unknown');
      assert.equal(result.polling.receiptPassId, result.polling.lastPassId);
      assert.equal(
        (await env.browser.unreadStart(input)).entries[0].notice.phase,
        'unknown'
      );
      checkUnreadReview(result, input.id);
      assert.equal(env.state.scans.length, 1);
      assert.equal(env.state.sends.length, 1);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'expiry awaits a native action that completes after the lifetime',
  { timeout: 5000 },
  async () =>
    gatedPollingFixture(
      async (env, input, release) => {
        await env.browser.unreadStart(input);
        await waitUnreadPolling(
          env.browser,
          input.id,
          () => env.state.scans[0]?.signal.aborted
        );
        assert.equal((await env.browser.unreadStatus(input)).state, 'active');
        release();
        const result = await waitUnreadPolling(
          env.browser,
          input.id,
          (value) => value.state === 'stopped'
        );
        assert.equal(result.polling.reason, 'expired');
        assert.equal(result.restoration.restored, true);
        assert.equal(env.state.scans.length, 1);
      },
      { ...pollingSettings, durationMs: 1000 }
    )
);
