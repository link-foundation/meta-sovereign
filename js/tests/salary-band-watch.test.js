import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedBrowserPlan } from '../src/automation/question-browser-plan.js';
import { planAnswer } from '../src/automation/question-answers.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { listOutbox } from '../src/automation/outbox.js';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import {
  bandSalary as salary,
  bandQuestion as question,
  bandChoices as options,
  bandMixedChoices,
  bandSavedRule,
} from '../../experiments/issue-56/salary-band-safety-fixture.mjs';

const withSalaryWatch = async (work, fixtureOptions = {}) => {
  const env = await questionWatchFixture(fixtureOptions);
  try {
    Object.assign(env.state.snapshot, salaryRow());
    env.input.review = (
      await env.browser.inspect({ ...env.review.target, salary })
    ).id;
    await work(env);
  } finally {
    await env.browser.close();
  }
};
const salaryRow = (extra = {}) => ({
  question: { id: '101', body: question, outgoing: false },
  answerOptions: options,
  ...extra,
});

test('only an approved complete native containing salary choice passes automatic admission', () => {
  const plan = planAnswer(question, { salary, options });
  assert.equal(plan.match, 'salary');
  assert.equal(plan.salary.option.contained, true);
  assert.equal(approvedBrowserPlan(plan), true);
  for (const held of [
    planAnswer(question, { salary }),
    planAnswer(question, { salary: { ...salary, approved: false }, options }),
    planAnswer(question, { salary, options: bandMixedChoices }),
    planAnswer(question, {
      salary: { ...salary, currencies: [{ code: 'USD', keywords: ['USD'] }] },
      options,
    }),
    planAnswer('What salary net do you expect?', {
      salary: { ...salary, defaultCurrency: null },
      options: options.map((option) => option.replace('USD ', '')),
    }),
    planAnswer(question, { salary, options, rules: [bandSavedRule()] }),
    planAnswer(question, { salary, options: ['USD 0–7000', 'USD 5000–8000'] }),
    planAnswer(question, { salary, options: ['USD 0–5000', 'USD 6500–8000'] }),
    { ...plan, strictOptions: false },
    { ...plan, option: 'Another option' },
    { ...plan, salary: { ...plan.salary, option: { contained: false } } },
  ]) {
    assert.equal(approvedBrowserPlan(held), false);
  }
});

test(
  'a confirmed salary watch selects once and keeps its positive durable receipt',
  { timeout: 5000 },
  () =>
    withSalaryWatch(async (env) => {
      await env.browser.watchStart(env.input);
      const settled = await env.until((s) =>
        ['sent', 'review'].includes(s.phase)
      );
      assert.equal(settled.phase, 'sent');
      assert.equal(settled.selection.option, options[1]);
      assert.equal(settled.outbox.receipt.messageId, '102');
      await env.browser.watchStart(env.input);
      const stopped = await env.browser.watchStop(env.input);
      assert.equal(stopped.owned, false);
      assert.deepEqual(
        env.state.sends.map((draft) => draft.text),
        [options[1]]
      );
      assert.equal((await listOutbox(env.store)).length, 1);
      assert.equal(env.state.closes, 1);
    })
);

test(
  'salary watches hold ambiguous bands and owner drafts without effects',
  { timeout: 5000 },
  async () => {
    for (const patch of [
      { answerOptions: bandMixedChoices },
      { answerOptions: ['USD 0–7000', 'USD 5000–8000'] },
      { hasDraft: true },
    ]) {
      await withSalaryWatch(async (env) => {
        Object.assign(env.state.snapshot, patch);
        env.input.review = (
          await env.browser.inspect({ ...env.review.target, salary })
        ).id;
        await env.browser.watchStart(env.input);
        const status = await env.until((s) =>
          ['review', 'owner-draft'].includes(s.phase)
        );
        assert.equal(status.phase, patch.hasDraft ? 'owner-draft' : 'review');
        assert.deepEqual(env.state.sends, []);
        assert.deepEqual(env.state.prefills, []);
      });
    }
  }
);

test(
  'a saved salary change queued before selection refuses before the provider effect',
  { timeout: 5000 },
  () => {
    let current;
    return withSalaryWatch(
      async (env) => {
        current = env;
        await env.browser.watchStart(env.input);
        const settled = await env.until(
          (s) => ['paused', 'review'].includes(s.state) || s.phase === 'review'
        );
        assert.equal(settled.state, 'paused');
        assert.equal(settled.reason, 'question-watch-plan-changed');
        assert.deepEqual(env.state.sends, []);
      },
      {
        selecting: () => saveAnswerRule(current.store, bandSavedRule()),
      }
    );
  }
);

test(
  'unread salary answers select the containing option and continue to ordinary review',
  { timeout: 5000 },
  async () => {
    const env = await unreadAnswerFixture({
      rows: [salaryRow(), { strictOptions: false }],
    });
    try {
      const result = await env.complete({ ...env.input, salary });
      assert.deepEqual(
        result.entries.map((entry) => entry.answer.phase),
        ['sent', 'prefilled']
      );
      assert.deepEqual(
        env.state.sends.map(({ chat, text }) => ({ chat, text })),
        [{ chat: '8', text: options[1] }]
      );
      assert.equal(result.entries[0].answer.outbox.receipt.messageId, '808');
      assert.equal(result.restoration.heldReview.chat, '9');
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'unread salary answers preserve owner drafts and mixed-currency review without dispatch',
  { timeout: 5000 },
  async () => {
    for (const patch of [
      { hasDraft: true },
      { answerOptions: bandMixedChoices },
    ]) {
      const env = await unreadAnswerFixture({ rows: [salaryRow(patch), {}] });
      try {
        const result = await env.complete({ ...env.input, salary });
        assert.equal(result.entries.length, 1);
        assert.equal(result.restoration.heldReview.chat, '8');
        assert.deepEqual(env.state.sends, []);
        assert.deepEqual(env.state.prefills, []);
        assert.deepEqual(await listOutbox(env.store), []);
      } finally {
        await env.browser.close();
      }
    }
  }
);

test(
  'an unread saved salary change refuses a queued choice without proceeding to another chat',
  { timeout: 5000 },
  async () => {
    const env = await unreadAnswerFixture({
      rows: [salaryRow(), {}],
      queued: (current) => saveAnswerRule(current.store, bandSavedRule()),
    });
    try {
      const result = await env.complete({ ...env.input, salary });
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].answer.phase, 'failed');
      assert.deepEqual(env.state.sends, []);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'an uncertain salary selection pauses and status recovery never repeats it',
  { timeout: 5000 },
  () =>
    withSalaryWatch(
      async (env) => {
        await env.browser.watchStart(env.input);
        const status = await env.until((s) => s.state === 'paused' && !s.owned);
        assert.equal(status.phase, 'unknown');
        assert.equal(status.outbox.status, 'unknown');
        assert.equal((await env.browser.watchStart(env.input)).state, 'paused');
        assert.equal(env.state.sends.length, 1);
        assert.equal(env.state.closes, 1);
      },
      { send: async () => ({ via: 'browser' }) }
    )
);
