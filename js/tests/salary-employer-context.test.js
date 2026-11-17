import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planAnswer } from '../src/automation/question-answers.js';
import {
  answerEnvironmentFromMessages,
  normalizeAnswerEnvironment,
  resolveAnswerContexts,
} from '../src/automation/question-context.js';
import { browserAnswerRecent } from '../src/sources/browser-answer-context.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { encodeLinoValue } from '../src/transport/lino.js';
import { assertQuestionPreviewSurfaces } from './helpers/question-surfaces.mjs';
import {
  questionBrowserFixture,
  browserTarget,
} from '../../experiments/issue-56/question-browser-fixture.mjs';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import { clarificationSalary as salary } from '../../experiments/issue-56/salary-clarification-fixture.mjs';
import {
  employerSalarySnapshot,
  employerSalaryMessages,
  employerSalaryAnswer as expected,
  employerSalaryQuestion as question,
} from '../../experiments/issue-56/salary-employer-context-fixture.mjs';

const archivedContext = () => {
  const messages = employerSalaryMessages();
  return answerEnvironmentFromMessages(messages, messages.at(-1));
};

test('captured and archived salary context retain outgoing identity through normalization', () => {
  for (const recent of [
    browserAnswerRecent(employerSalarySnapshot()),
    archivedContext().recent,
  ]) {
    assert.equal(recent[0].outgoing, true);
    assert.equal(
      normalizeAnswerEnvironment({ recent }).recent[0].outgoing,
      true
    );
  }
  assert.deepEqual(normalizeAnswerEnvironment({ recent: ['EUR'] }).recent, [
    { text: 'EUR' },
  ]);
  assert.throws(
    () =>
      normalizeAnswerEnvironment({
        recent: [{ text: 'EUR', outgoing: 'false' }],
      }),
    /invalid recent/u
  );
});

test('salary context uses employer currency rather than an earlier outgoing answer', () => {
  for (const environment of [
    archivedContext(),
    { recent: browserAnswerRecent(employerSalarySnapshot()) },
  ]) {
    const answer = planAnswer(question, { salary, ...environment });
    assert.equal(answer.text, expected);
    assert.equal(answer.salary.currency, 'EUR');
    assert.match(answer.contexts[0].evidence, /101$/u);
  }
});

test('outgoing salary questions cannot create an employer clarification anchor', () => {
  const observed = employerSalarySnapshot();
  observed.messages[0].body = 'Thanks for your interest.';
  observed.messages[1].body =
    'What salary expectations in USD gross do you have?';
  const answer = planAnswer(question, {
    salary,
    recent: browserAnswerRecent(observed),
  });
  assert.notEqual(answer.match, 'salary');
});

test('outgoing currency, unrelated questions and period changes cannot replace incoming salary context', () => {
  for (const body of [
    'I prefer GBP.',
    'What is your role?',
    'What hourly salary in USD do you expect?',
  ]) {
    const observed = employerSalarySnapshot();
    observed.messages[1].body = body;
    assert.equal(
      planAnswer(question, { salary, recent: browserAnswerRecent(observed) })
        .text,
      expected,
      body
    );
  }
});

test('browser salary prefill uses employer context and sends nothing', async (t) => {
  const env = await questionBrowserFixture();
  t.after(() => env.browser.close());
  Object.assign(env.state.snapshot, employerSalarySnapshot());
  const review = await env.browser.inspect({ ...browserTarget, salary });
  assert.equal(review.plan.text, expected);
  await env.browser.prefill(review);
  assert.equal(env.state.prefills[0].text, expected);
  assert.deepEqual(env.state.sends, []);
});

test(
  'salary watches retain employer context across a changed outgoing reply',
  { timeout: 5000 },
  async (t) => {
    const env = await questionWatchFixture();
    t.after(() => env.browser.close());
    Object.assign(env.state.snapshot, employerSalarySnapshot());
    env.input.review = (
      await env.browser.inspect({ ...browserTarget, salary })
    ).id;
    await env.browser.watchStart(env.input);
    const current = await env.until(
      (value) => value.last?.plan?.text === expected
    );
    assert.equal(current.phase, 'review');
    env.state.snapshot.messages[0].body =
      'What salary expectations in USD gross do you have?';
    env.state.snapshot.messages[1].body = 'I prefer EUR.';
    await env.until((value) => value.last?.plan?.salary?.currency === 'USD');
    assert.equal(
      (await env.browser.watchStatus(env.input)).last.plan.text,
      'From $6 000 net per month.'
    );
    await env.browser.watchStop(env.input);
    assert.equal(env.state.closes, 1);
    assert.deepEqual(env.state.sends, []);
  }
);

test(
  'unread employer salary clarification prefills without model opt-in or sends',
  { timeout: 5000 },
  async (t) => {
    const env = await unreadAnswerFixture({ rows: [employerSalarySnapshot()] });
    t.after(() => env.browser.close());
    const result = await env.complete({
      ...env.input,
      salary,
      modelDraft: false,
    });
    assert.equal(result.entries[0].answer.phase, 'prefilled');
    assert.deepEqual(env.state.prefills, [{ chat: '8', text: expected }]);
    assert.deepEqual(env.state.sends, []);
  }
);

test('outgoing delivery barriers and owner-defined generic context keep their behavior', () => {
  const observed = employerSalarySnapshot();
  observed.messages[1].delivery = 'unknown';
  assert.deepEqual(browserAnswerRecent(observed), []);
  const messages = employerSalaryMessages();
  messages[1].pending = true;
  assert.deepEqual(
    answerEnvironmentFromMessages(messages, messages.at(-1)).recent,
    []
  );
  const configured = resolveAnswerContexts('Which work format?', {
    recent: [{ text: 'I prefer remote.', outgoing: true }],
    contexts: [
      {
        key: 'format',
        choices: [
          { id: 'remote', keywords: ['remote'], profile: { city: 'Hanoi' } },
        ],
      },
    ],
  });
  assert.equal(configured.profile.city, 'Hanoi');
});

test(
  'archived employer identity survives CLI, offline and both Lino salary previews',
  { timeout: 15000 },
  async (t) => {
    const store = createMemoryStore();
    const folder = await mkdtemp(join(tmpdir(), 'salary-employer-'));
    t.after(() => rm(folder, { recursive: true, force: true }));
    const input = { salary, question, ...archivedContext() };
    const config = join(folder, 'context.lino');
    await writeFile(config, encodeLinoValue(input));
    await assertQuestionPreviewSurfaces({
      store,
      cliArguments: { config },
      input,
      verify: (answer) => assert.equal(answer.text, expected),
    });
    assert.deepEqual(await store.query(() => true), []);
  }
);
