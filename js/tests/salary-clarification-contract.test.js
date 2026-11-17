import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { encodeLinoValue } from '../src/transport/lino.js';
import { assertQuestionPreviewSurfaces } from './helpers/question-surfaces.mjs';
import { planAnswer } from '../src/automation/question-answers.js';
import {
  clarificationSalary as salary,
  salaryAnchor,
  salaryClarification,
  salaryClarificationAnswer,
} from '../../experiments/issue-56/salary-clarification-fixture.mjs';

test('polite salary figure requests preserve independent language, currency and tax basis', () => {
  const recent = ['От 450000 рублей в месяц на руки.', salaryAnchor];
  for (const [question, expected] of [
    [salaryClarification, salaryClarificationAnswer],
    [
      'Подскажите, пожалуйста, сумму в USD до вычета налогов?',
      salaryClarificationAnswer,
    ],
    [
      'Please provide the figures in USD before taxes.',
      'From $7 100 gross per month.',
    ],
  ]) {
    const answer = planAnswer(question, { salary, recent });
    assert.equal(answer.text, expected, question);
    assert.equal(answer.complete, true);
    assert.equal(answer.requiresReview, false);
    assert.equal(answer.salary.currency, 'USD');
    assert.equal(answer.salary.basis, 'gross');
  }
});

test('consecutive salary clarifications inherit the newest requested basis and original period', () => {
  const answer = planAnswer('А в рублях?', {
    salary,
    recent: ['USD gross?', salaryAnchor],
  });
  assert.equal(answer.text, 'От 530 000 ₽ в месяц до вычета налогов.');
  const hourly = planAnswer('And in EUR?', {
    salary,
    recent: ['And gross?', 'What hourly rate in USD net do you expect?'],
  });
  assert.equal(hourly.text, 'From 45 € gross per hour.');
  const bare = planAnswer('EUR net?', {
    salary,
    recent: ['USD gross?', salaryAnchor],
  });
  assert.equal(bare.text, 'От 5 500 € в месяц на руки.');
});

test('unrelated currency questions and money topics cannot revive salary context', () => {
  const answer = planAnswer('Ваши зарплатные ожидания?', {
    salary: { ...salary, defaultCurrency: null },
    recent: ['What is your project budget in USD?', salaryAnchor],
  });
  assert.equal(answer.complete, false);
  assert.equal(answer.salary.currency, null);
  for (const question of [
    'Please provide the budget in USD before taxes.',
    'Подскажите выручку в долларах до вычета налогов?',
    'Could you share your GitHub profile in USD?',
    'Как рассчитываете налоги в долларах?',
    'And in EUR per hour?',
  ]) {
    assert.notEqual(
      planAnswer(question, { salary, recent: [salaryAnchor] }).match,
      'salary'
    );
  }
  assert.notEqual(
    planAnswer('EUR?', {
      salary,
      recent: ['And per hour?', salaryAnchor],
    }).match,
    'salary'
  );
  assert.notEqual(
    planAnswer(salaryClarification, {
      salary: { ...salary, enabled: false },
      recent: [salaryAnchor],
    }).match,
    'salary'
  );
});

test(
  'CLI file, offline and both Lino previews retain bounded salary clarification context without mutation',
  { timeout: 15000 },
  async (t) => {
    const store = createMemoryStore();
    const directory = await mkdtemp(join(tmpdir(), 'ms-salary-clarification-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const input = {
      question: salaryClarification,
      salary,
      recent: [salaryAnchor],
    };
    const file = join(directory, 'clarification.lino');
    await writeFile(file, encodeLinoValue(input));
    await assertQuestionPreviewSurfaces({
      store,
      cliArguments: { config: file },
      input,
      verify(answer) {
        assert.equal(answer.text, salaryClarificationAnswer);
        assert.equal(answer.salary.currency, 'USD');
        assert.equal(answer.salary.basis, 'gross');
        assert.equal(answer.requiresReview, false);
      },
    });
    assert.deepEqual(await store.query(() => true), []);
  }
);

test('ordinary expected-pay field labels and hourly wording use the configured targets', () => {
  for (const question of [
    'От какой суммы рассматриваете предложения?',
    'Укажите желаемый уровень дохода',
    'Ожидания по зп?',
  ]) {
    assert.equal(
      planAnswer(question, { salary, questionMode: 'field' }).text,
      'От 450 000 ₽ в месяц на руки.',
      question
    );
  }
  assert.equal(
    planAnswer('Ваша часовая ставка в евро до вычета налогов?', { salary })
      .text,
    'От 45 € в час до вычета налогов.'
  );
  const range = 'Свыше 241 тыс. руб';
  assert.equal(
    planAnswer('В каком диапазоне рассматриваете предложения? (на руки)', {
      salary,
      questionMode: 'field',
      options: ['До 100 тыс. руб', range],
    }).text,
    range
  );
});
