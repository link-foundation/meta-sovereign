import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';

const checkPlanning = async (check, options) => {
  const env = await questionWatchFixture(options);
  try {
    await check(env);
  } finally {
    await env.browser.close();
  }
};
const startFrom = async (env, options) => {
  const review = await env.browser.inspect({
    ...env.review.target,
    ...options,
  });
  assert.equal(review.plan.option, 'No');
  env.input.review = review.id;
  await env.browser.watchStart(env.input);
  return env.until((status) =>
    ['sent', 'review', 'failed'].includes(status.phase)
  );
};
const profileRule = async (env) => {
  await env.store.delete('qa-rule:experience');
  await saveAnswerRule(env.store, {
    id: 'profile-choice',
    question: env.state.snapshot.question.body,
    answers: [{ text: '{{qualification}}', approved: true }],
  });
};

test('watch retains the inspected rule filter instead of admitting other approved rules', () =>
  checkPlanning(async (env) => {
    await saveAnswerRule(env.store, {
      id: 'other-experience',
      question: env.state.snapshot.question.body,
      answers: [{ text: 'No', approved: true }],
    });
    const status = await startFrom(env, {
      ruleIds: ['qa-rule:other-experience'],
    });
    assert.equal(status.phase, 'sent');
    assert.equal(env.state.sends[0].text, 'No');
  }));

test('watch retains a detached local profile and ignores caller mutation after inspection', () =>
  checkPlanning(async (env) => {
    await profileRule(env);
    const profile = { qualification: 'No' };
    const review = await env.browser.inspect({ ...env.review.target, profile });
    assert.equal(review.plan.option, 'No');
    profile.qualification = 'Yes';
    env.input.review = review.id;
    await env.browser.watchStart(env.input);
    const status = await env.until((s) => ['sent', 'review'].includes(s.phase));
    assert.equal(status.phase, 'sent');
    assert.equal(env.state.sends[0].text, 'No');
  }));

test('watch uses current named-profile values and refuses a queued profile change before dispatch', () => {
  let env;
  return checkPlanning(
    async (fixture) => {
      env = fixture;
      await profileRule(env);
      await env.store.put({
        id: 'qa-profile:watch-owner',
        name: 'Watch owner',
        revision: '00000000-0000-4000-8000-000000000001',
        updatedAt: '2026-11-10T11:00:00.000Z',
        values: { qualification: 'No' },
      });
      const status = await startFrom(env, {
        profileId: 'qa-profile:watch-owner',
      });
      assert.equal(status.phase, 'failed');
      assert.equal(status.reason, 'question-watch-plan-changed');
      assert.equal(status.outbox.status, 'failed');
      assert.equal(env.state.sends.length, 0);
      await env.until((s) => !s.owned);
      assert.equal(env.state.closes, 1);
    },
    {
      selecting: async () => {
        const profile = await env.store.get('qa-profile:watch-owner');
        await env.store.put({ ...profile, values: { qualification: 'Yes' } });
      },
    }
  );
});
