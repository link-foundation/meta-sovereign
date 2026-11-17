import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserAnswerPlanning } from '../src/automation/question-browser-vacancy.js';
import { previewAnswer } from '../src/automation/question-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  questionBrowserFixture,
  browserTarget,
} from '../../experiments/issue-56/question-browser-fixture.mjs';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import { clarificationSalary as salary } from '../../experiments/issue-56/salary-clarification-fixture.mjs';
import {
  salaryVacancyQuestion as question,
  salaryVacancySnapshot as page,
  salaryVacancyQuestionSnapshot as snapshot,
} from '../../experiments/issue-56/salary-vacancy-fixture.mjs';
import {
  salaryVacancyCard as card,
  salaryVacancyCardAnswer as expected,
} from '../../experiments/issue-56/salary-vacancy-card-fixture.mjs';

const observedCard = () => {
  const observed = snapshot();
  observed.noticeContext.vacancy = card;
  return observed;
};
const setupReader = () => {
  const reads = [];
  return {
    reads,
    readVacancy: async (url) => {
      reads.push(url);
      return page(url);
    },
  };
};

test('observed HH vacancy card currency precedes a different linked page without opening it', async () => {
  const reader = setupReader();
  const env = await questionBrowserFixture(reader);
  try {
    Object.assign(env.state.snapshot, observedCard());
    const review = await env.browser.inspect({ ...browserTarget, salary });
    assert.equal(review.plan.text, expected);
    assert.match(review.plan.contexts[0].evidence, /#card$/u);
    await env.browser.prefill(review);
    assert.equal(env.state.prefills[0].text, expected);
    assert.deepEqual(reader.reads, []);
    assert.deepEqual(env.state.sends, []);
  } finally {
    await env.browser.close();
  }
});

test('HH card context remains usable when no linked-page reader is configured', async () => {
  const store = createMemoryStore();
  const planning = await createBrowserAnswerPlanning({ store })(
    { salary },
    observedCard(),
    browserTarget
  );
  const result = await previewAnswer(store, { salary, question, ...planning });
  assert.equal(result.text, expected);
});

test(
  'watched HH card changes replace derived currency even at the same vacancy URL',
  { timeout: 5000 },
  async () => {
    const reader = setupReader();
    const env = await questionWatchFixture(reader);
    try {
      Object.assign(env.state.snapshot, observedCard());
      env.input.review = (
        await env.browser.inspect({ ...browserTarget, salary })
      ).id;
      await env.browser.watchStart(env.input);
      assert.equal(
        (await env.until((value) => value.last?.plan?.text === expected)).phase,
        'review'
      );
      env.state.snapshot.noticeContext.vacancy = 'Engineer — salary USD';
      const changed = await env.until(
        (value) => value.last?.plan?.salary?.currency === 'USD'
      );
      assert.equal(changed.last.plan.text, 'From $6 000 net per month.');
      await env.browser.watchStop(env.input);
      assert.deepEqual(reader.reads, []);
      assert.deepEqual(env.state.sends, []);
      assert.equal(env.state.closes, 1);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'sequential unread review uses the observed HH card before linked page context',
  { timeout: 5000 },
  async () => {
    const reader = setupReader();
    const observed = observedCard();
    observed.chat = '8';
    const env = await unreadAnswerFixture({ rows: [observed], ...reader });
    try {
      const result = await env.complete({
        ...env.input,
        salary,
        modelDraft: false,
      });
      assert.equal(result.entries[0].answer.phase, 'prefilled');
      assert.deepEqual(env.state.prefills, [{ chat: '8', text: expected }]);
      assert.deepEqual(reader.reads, []);
      assert.deepEqual(env.state.sends, []);
    } finally {
      await env.browser.close();
    }
  }
);

test('explicit and relevant incoming currency keep priority over the observed vacancy card', async () => {
  const reader = setupReader();
  const store = createMemoryStore();
  const prepare = createBrowserAnswerPlanning({ store, ...reader });
  for (const patch of [
    { recent: ['Salary is paid in USD.'] },
    { vacancy: { pay: 'USD' } },
    { question: 'What are your salary expectations in USD?' },
  ]) {
    const observed = observedCard();
    if (patch.question) {
      observed.question.body = patch.question;
    }
    const planning = await prepare(
      { salary, ...patch },
      observed,
      browserTarget
    );
    const result = await previewAnswer(store, {
      salary,
      question: observed.question.body,
      ...planning,
    });
    assert.equal(result.salary.currency, 'USD');
  }
  assert.deepEqual(reader.reads, []);
});

test('ambiguous or unconfigured HH card currency cannot be replaced by a linked page or default', async () => {
  const reader = setupReader();
  const store = createMemoryStore();
  const prepare = createBrowserAnswerPlanning({ store, ...reader });
  for (const title of ['Engineer USD or EUR', 'Engineer GBP']) {
    const observed = observedCard();
    observed.noticeContext.vacancy = title;
    const planning = await prepare({ salary }, observed, browserTarget);
    const result = await previewAnswer(store, {
      salary,
      question,
      ...planning,
    });
    assert.equal(result.complete, false);
    assert.equal(result.salary.currency, null);
  }
  assert.deepEqual(reader.reads, []);
});
