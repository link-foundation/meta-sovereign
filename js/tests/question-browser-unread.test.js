import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import { createDefaultSender } from '../src/sources/browser-sender.js';
import {
  unreadInput,
  unreadPass,
  unreadReviewFixture,
  waitUnreadReview,
} from '../../experiments/issue-56/question-unread-review-fixture.mjs';

const completeUnread = async (env, input) => {
  await env.browser.unreadStart(input);
  return waitUnreadReview(env.browser, input.id);
};

test('unread review requires confirmed bounded supported admission before any provider read', async () => {
  const env = await unreadReviewFixture();
  try {
    for (const input of [
      unreadInput({ confirm: false }),
      unreadInput({ id: 'wrong' }),
      unreadInput({ source: 'vk' }),
      unreadInput({ maxChats: 101 }),
      unreadInput({ budgetMs: 0 }),
    ]) {
      await assert.rejects(env.browser.unreadStart(input));
    }
    assert.equal(env.state.scans.length, 0);
    const send = createDefaultSender({
      browser: {
        openSession: async () =>
          assert.fail('capabilities must not open a browser'),
      },
    });
    try {
      const browser = createQuestionBrowser({ store: env.store, send });
      assert.deepEqual(browser.capabilities().unreadSources, [
        { id: 'hh', name: 'HeadHunter' },
      ]);
      await browser.close();
    } finally {
      await send.close();
    }
  } finally {
    await env.browser.close();
  }
});

test('finite unread reviews freeze observed questions without rereads, models, prefills or sends', async () => {
  const env = await unreadReviewFixture();
  const input = unreadInput({ modelDraft: true });
  try {
    const result = await completeUnread(env, input);
    assert.equal(result.state, 'completed');
    assert.equal(result.coverage.complete, false);
    assert.equal(result.restoration.restored, true);
    assert.equal(result.entries.length, 1);
    const review = await env.browser.status({ id: result.entries[0].reviewId });
    assert.equal(review.chat, '8');
    assert.equal(review.plan.text, 'Yes');
    assert.equal((await env.store.get(review.id)).planning.modelDraft, false);
    assert.equal(env.state.scans.length, 1);
    assert.deepEqual(env.state.reads, []);
    assert.deepEqual(env.state.prefills, []);
    assert.deepEqual(env.state.sends, []);
    await env.browser.unreadStart({ ...input, source: 'vk', maxChats: 100 });
    assert.equal(env.state.scans.length, 1);
    assert.equal((await env.browser.unreadStatus(input)).settings.maxChats, 2);
  } finally {
    await env.browser.close();
  }
});

test('unverified chat questions remain visible without actionable review IDs', async () => {
  const pass = unreadPass();
  pass.conversations.push({ chat: '9', question: null });
  pass.coverage = { ...pass.coverage, observed: 2, visited: 2 };
  const env = await unreadReviewFixture(async () => pass);
  const input = unreadInput();
  try {
    const result = await completeUnread(env, input);
    assert.equal(result.state, 'completed');
    assert.equal(result.entries[1].chat, '9');
    assert.equal(result.entries[1].reviewId, undefined);
    assert.equal(result.entries[1].code, 'question-browser-unverified');
  } finally {
    await env.browser.close();
  }
});

test('concurrent duplicate IDs share one pass, and Stop aborts then drains restoration', async () => {
  let finish;
  let aborted = false;
  const env = await unreadReviewFixture(
    ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            finish = () => resolve(unreadPass());
          },
          { once: true }
        );
      })
  );
  const input = unreadInput();
  try {
    const [first, second] = await Promise.all([
      env.browser.unreadStart(input),
      env.browser.unreadStart(input),
    ]);
    assert.equal(first.id, second.id);
    assert.equal(env.state.scans.length, 1);
    await assert.rejects(env.browser.unreadStart(unreadInput()), {
      code: 'question-unread-active',
    });
    let drained = false;
    const stopped = env.browser.unreadStop(input).then((value) => {
      drained = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(aborted, true);
    assert.equal(drained, false);
    finish();
    const result = await stopped;
    assert.equal(result.state, 'stopped');
    assert.equal(result.restoration.restored, true);
    assert.deepEqual(result.entries, []);
    assert.equal(result.owned, false);
  } finally {
    finish?.();
    await env.browser.close();
  }
});

test('restart status pauses abandoned passes and never resumes mark-read actions', async () => {
  const env = await unreadReviewFixture();
  const input = unreadInput();
  try {
    await env.browser.unreadStart(input);
    await waitUnreadReview(env.browser, input.id);
    const record = await env.store.get(input.id);
    await env.store.put({ ...record, state: 'active' });
    const restarted = createQuestionBrowser(env);
    try {
      const result = await restarted.unreadStatus(input);
      assert.equal(result.state, 'paused');
      assert.equal(result.owned, false);
      await restarted.unreadStart(input);
      assert.equal(env.state.scans.length, 1);
    } finally {
      await restarted.close();
    }
  } finally {
    await env.browser.close();
  }
});

test('owner-return failures retain actual restoration refusal and no fabricated coverage', async () => {
  const env = await unreadReviewFixture(async () => {
    throw Object.assign(new Error('owner returned'), {
      code: 'browser-owner-active',
      restoration: { restored: false, reason: 'owner-active' },
    });
  });
  const input = unreadInput();
  try {
    const result = await completeUnread(env, input);
    assert.equal(result.state, 'failed');
    assert.deepEqual(result.restoration, {
      restored: false,
      reason: 'owner-active',
    });
    assert.equal(result.coverage, null);
    assert.deepEqual(result.entries, []);
  } finally {
    await env.browser.close();
  }
});

test('malformed or falsely complete native receipts cannot create reviews', async () => {
  const pass = unreadPass();
  pass.coverage.complete = true;
  const env = await unreadReviewFixture(async () => pass);
  const input = unreadInput();
  try {
    const result = await completeUnread(env, input);
    assert.equal(result.state, 'failed');
    assert.equal(result.code, 'question-unread-unverified');
    assert.deepEqual(result.entries, []);
  } finally {
    await env.browser.close();
  }
});

test('shutdown closes queued admission before a provider read can start', async () => {
  const env = await unreadReviewFixture();
  const start = env.browser.unreadStart(unreadInput());
  const close = env.browser.close();
  await assert.rejects(start, { code: 'question-unread-closed' });
  await close;
  assert.deepEqual(env.state.scans, []);
});

test('status during admission retains ownership, and foreign recovery never rewrites a running pass', async () => {
  const env = await unreadReviewFixture();
  const input = unreadInput();
  let release;
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  env.store.flush = async () => {
    entered();
    await gate;
  };
  const start = env.browser.unreadStart(input);
  const other = createQuestionBrowser(env);
  try {
    await ready;
    assert.equal((await env.browser.unreadStatus(input)).state, 'active');
    assert.equal((await other.unreadStatus(input)).state, 'paused');
    assert.equal((await env.store.get(input.id)).state, 'active');
    assert.equal(env.state.scans.length, 0);
    release();
    await start;
    assert.equal(
      (await waitUnreadReview(env.browser, input.id)).state,
      'completed'
    );
    assert.equal(env.state.scans.length, 1);
  } finally {
    release();
    await start;
    await other.close();
    await env.browser.close();
  }
});

test('failed admission durability cannot traverse and the retained ID cannot replay it', async () => {
  const env = await unreadReviewFixture();
  const input = unreadInput();
  env.store.flush = async () => {
    throw new Error('durability unavailable');
  };
  try {
    await assert.rejects(
      env.browser.unreadStart(input),
      /durability unavailable/
    );
    assert.equal((await env.browser.unreadStart(input)).state, 'paused');
    assert.deepEqual(env.state.scans, []);
  } finally {
    await env.browser.close();
  }
});
