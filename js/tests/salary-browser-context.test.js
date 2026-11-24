import test from 'node:test';
import assert from 'node:assert/strict';
import { browserAnswerRecent } from '../src/sources/browser-answer-context.js';
import { browserAnswerPlanning } from '../src/automation/question-browser-context.js';
import {
  questionBrowserFixture,
  browserTarget,
} from '../../experiments/issue-56/question-browser-fixture.mjs';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import { salaryBrowserContext } from '../../experiments/issue-56/salary-browser-context-fixture.mjs';
import {
  clarificationSalary as salary,
  salaryPhrasingAnswer as expected,
} from '../../experiments/issue-56/salary-clarification-fixture.mjs';

test('browser salary review derives its context from captured history without caller recent text', async () => {
  const env = await questionBrowserFixture();
  try {
    Object.assign(env.state.snapshot, salaryBrowserContext());
    const review = await env.browser.inspect({ ...browserTarget, salary });
    assert.equal(review.plan.text, expected);
    await env.browser.prefill(review);
    assert.deepEqual(
      env.state.prefills[0].expected.recent,
      browserAnswerRecent(env.state.snapshot)
    );
    assert.equal(env.state.sends.length, 0);
  } finally {
    await env.browser.close();
  }
});

test(
  'salary watches rederive contextual review plans for each observation',
  { timeout: 5000 },
  async () => {
    const env = await questionWatchFixture();
    try {
      Object.assign(env.state.snapshot, salaryBrowserContext());
      env.input.review = (
        await env.browser.inspect({ ...browserTarget, salary })
      ).id;
      await env.browser.watchStart(env.input);
      const status = await env.until((value) =>
        ['prefilled', 'review'].includes(value.phase)
      );
      assert.equal(status.phase, 'review');
      assert.equal(status.last.plan.text, expected);
      env.state.snapshot.messages[0].body = 'What is your role?';
      const changed = await env.until(
        (value) => value.last?.plan?.complete === false
      );
      assert.equal(changed.last.plan.text, '');
      assert.deepEqual(env.state.prefills, []);
      await env.browser.watchStop(env.input);
      assert.equal(env.state.closes, 1);
      assert.equal(env.state.sends.length, 0);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'unread salary answering uses captured history without model opt-in',
  { timeout: 5000 },
  async () => {
    const env = await unreadAnswerFixture({ rows: [salaryBrowserContext()] });
    try {
      const result = await env.complete({
        ...env.input,
        salary,
        modelDraft: false,
      });
      assert.equal(result.entries[0].answer.phase, 'prefilled');
      assert.deepEqual(env.state.prefills, [{ chat: '8', text: expected }]);
      assert.equal(env.state.sends.length, 0);
    } finally {
      await env.browser.close();
    }
  }
);

test('native context retains chronological barriers, bounded dates and the twenty-message limit', () => {
  const observed = salaryBrowserContext();
  assert.deepEqual(
    browserAnswerRecent(observed).map((row) => row.evidence),
    ['browser:102', 'browser:101']
  );
  for (const patch of [
    { service: true },
    { deleted: true },
    { pending: true },
    { failed: true },
    { delivery: 'unknown' },
    { delivery: 'failed' },
    { delivery: 'pending' },
    { timestamp: null },
    { timestamp: 'invalid' },
    { timestamp: '2026-11-18T10:00:00Z' },
    { timestamp: '2026-11-15T10:00:00Z' },
  ]) {
    const changed = globalThis.structuredClone(observed);
    Object.assign(changed.messages[1], patch);
    assert.deepEqual(browserAnswerRecent(changed), [], JSON.stringify(patch));
    assert.deepEqual(
      browserAnswerPlanning({ recent: ['Spoofed salary context'] }, changed)
        .recent,
      []
    );
  }
  const unknown = globalThis.structuredClone(observed);
  unknown.messages.at(-1).timestamp = null;
  assert.deepEqual(browserAnswerRecent(unknown), []);
  const reordered = globalThis.structuredClone(observed);
  reordered.messages[0].timestamp = '2026-11-17T09:59:30Z';
  assert.equal(browserAnswerRecent(reordered).length, 1);
  const many = {
    ...observed,
    messages: Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      body: 'Visible context',
      outgoing: false,
      timestamp: '2026-11-17T09:59:00Z',
    })).concat(observed.messages.at(-1)),
  };
  assert.equal(browserAnswerRecent(many).length, 20);
});

test('mismatched or oversized captured history cannot fall back to supplied context', () => {
  const observed = salaryBrowserContext();
  for (const mutate of [
    (value) => value.messages.push(value.messages[0]),
    (value) => {
      value.messages.at(-1).body = 'Different question';
    },
    (value) => {
      value.messages[0].body = 'x'.repeat(6001);
    },
    (value) => {
      value.messages[0].outgoing = 'false';
    },
    (value) => {
      value.messages = new Array(501).fill(value.messages[0]);
    },
  ]) {
    const changed = globalThis.structuredClone(observed);
    mutate(changed);
    assert.throws(
      () => browserAnswerPlanning({ recent: ['USD salary?'] }, changed),
      { code: 'question-browser-unverified' }
    );
  }
  assert.deepEqual(
    browserAnswerPlanning(
      { recent: ['Explicit legacy input'] },
      { question: observed.question }
    ).recent,
    [{ text: 'Explicit legacy input' }]
  );
});
