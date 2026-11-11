import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkForm, toForm } from '../src/web/automations-model.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  planAnswer,
  normalizeAnswerAction,
} from '../src/automation/question-answers.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import { learnFormAnswerPairs } from '../src/forms/answer-learning.js';
import { validateFormInspection } from '../src/forms/plan-validation.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  formPayProfile,
  formPayIntro,
  formPayAnswer,
} from '../../experiments/issue-56/forms-pay-fixture.mjs';

const salary = {
  enabled: true,
  approved: true,
  vacancyGuidance: true,
  defaultCurrency: 'RUB',
  defaultBasis: 'net',
  monthlyHours: 168,
  currencies: [
    {
      code: 'RUB',
      keywords: ['₽', 'RUB', 'руб'],
      net: 450000,
      hourlyNet: 2700,
      hourlyStep: 1,
    },
  ],
};
const hourly = 'На какую оплату в час рассчитываете?';
const answer = (vacancy, extra = {}) =>
  planAnswer(hourly, { salary, vacancy, questionMode: 'field', ...extra });
const form = (intro, fields = [field(hourly)]) => {
  const report = inspection(fields);
  report.frames[0].intro = intro;
  return report;
};

test('vacancy pay uses the top of its range or from amount with a separate comfortable rate', () => {
  for (const pay of [
    '60 000–80 000 ₽ net per month',
    'от 80 тыс. руб на руки в месяц',
  ]) {
    const result = answer({ pay, evidence: 'vacancy:hh:12' });
    assert.equal(
      result.text,
      'Минимум — 476.19 ₽ в час на руки. Комфортная ставка — 2 700 ₽ в час на руки.'
    );
    assert.equal(result.salary.guidance.source, 'vacancy-pay');
    assert.equal(result.salary.guidance.evidence, 'vacancy:hh:12');
    assert.equal(result.salary.guidance.offered, 80000);
    assert.equal(result.salary.guidance.monthlyHours, 168);
    assert.equal(result.requiresReview, true);
  }
});

test('form introduction takes priority and converts the stated lesson duration without a calculation dump', () => {
  const result = answer(
    { pay: '80 000 ₽ net per month' },
    { intro: formPayIntro }
  );
  assert.equal(result.text, formPayAnswer);
  assert.equal(result.salary.guidance.source, 'form-intro');
  assert.equal(result.salary.guidance.durationHours, 1.5);
  assert.ok(result.text.length < 130);
  const monthly = planAnswer('Ваши зарплатные ожидания в месяц на руки?', {
    salary,
    intro: formPayIntro,
  });
  assert.equal(
    monthly.text,
    'Минимум — 336 000 ₽ в месяц на руки. Комфортная ставка — 2 700 ₽ в час на руки.'
  );
});

test('owner target is retained for higher, missing or incompatible offers, and policy stays opt-in', () => {
  for (const pay of [
    '',
    '600 000 ₽ net per month',
    '80 000 ₽ gross per month',
    '80 000 ₽ per month',
  ]) {
    const result = answer({ pay });
    assert.equal(result.salary.amount, 2679);
    assert.ok(result.text.includes('2 700 ₽'));
    assert.ok(!result.text.includes('476.19'));
  }
  assert.equal(answer({ pay: 'USD 1000 net per month' }).complete, false);
  const result = planAnswer('What hourly rate in RUB do you expect?', {
    salary: { ...salary, vacancyGuidance: false },
    vacancy: { pay: '80 000 ₽ net per month' },
  });
  assert.equal(result.text, 'From 2 679 ₽ net per hour.');
});

test('configured currencies keep introduction priority and opt-in conversion defaults to 168 hours', () => {
  const custom = {
    ...salary,
    monthlyHours: undefined,
    defaultCurrency: 'CNY',
    currencies: [{ ...salary.currencies[0], code: 'CNY', keywords: ['CNY'] }],
  };
  const normalized = normalizeAnswerAction({ salary: custom }).salary;
  assert.equal(normalized.monthlyHours, 168);
  const result = planAnswer('What hourly rate in CNY do you expect?', {
    salary: custom,
    intro: 'Pay: 3000 CNY net per lesson of 1.5 hours',
    vacancy: { pay: '80000 CNY net per month' },
  });
  assert.equal(result.salary.guidance.minimum, 2000);
  assert.equal(result.salary.guidance.source, 'form-intro');
  assert.equal(result.requiresReview, true);
});

test('guidance settings and explicit comfortable rates survive normalization and reject invalid amounts', () => {
  const normalized = normalizeAnswerAction({ salary }).salary;
  assert.equal(normalized.vacancyGuidance, true);
  assert.equal(normalized.currencies[0].hourlyNet, 2700);
  const automation = normalizeAutomation({
    id: 'pay-guidance',
    action: { kind: 'answer-questions', salary },
  });
  assert.deepEqual(
    checkForm(toForm(automation), automation).automation.action.salary,
    normalized
  );
  for (const value of [0, -1, Infinity, '2700']) {
    assert.throws(() =>
      normalizeAnswerAction({
        salary: {
          ...salary,
          currencies: [{ ...salary.currencies[0], hourlyNet: value }],
        },
      })
    );
  }
});

test('reviewed form plans use the selected owner salary/rate profile and only the relevant frame introduction', async () => {
  const store = createMemoryStore();
  const profile = await saveAnswerProfile(store, {
    id: 'pay',
    name: 'Pay',
    values: formPayProfile,
  });
  const before = JSON.stringify(await store.query(() => true));
  const report = form(formPayIntro, [
    field(hourly),
    field('Describe payroll database design'),
  ]);
  const result = await planFormAnswers(store, {
    inspection: report,
    profileId: profile.id,
    vacancy: { pay: '80 000 ₽ net per month' },
  });
  assert.equal(result.fields[0].answer.proposal?.value, formPayAnswer);
  assert.equal(result.fields[0].answer.source, 'salary');
  assert.equal(result.fields[0].answer.requiresReview, true);
  assert.equal(result.fields[1].answer.proposal, null);
  assert.equal(JSON.stringify(await store.query(() => true)), before);
  report.frames.push({
    id: 'frame-2',
    parent: 'frame-1',
    url: 'https://other.test/form',
    reasons: [],
    intro: 'Pay: USD 10 net per hour',
  });
  report.fields.push(field(hourly, { id: 'frame-2:pay', frame: 'frame-2' }));
  const scoped = await planFormAnswers(store, {
    inspection: report,
    profileId: profile.id,
  });
  assert.equal(scoped.fields[0].answer.text, formPayAnswer);
  assert.equal(
    scoped.fields[2].answer.proposal,
    null,
    'other currency cannot inherit RUB pay'
  );
});

test('malformed introductions and ambiguous pay are bounded and never fall through to a lower-priority vacancy offer', () => {
  for (const intro of [4, 'x'.repeat(6001)]) {
    assert.throws(() => validateFormInspection(form(intro)), {
      code: 'form-report',
    });
  }
  for (const intro of [
    'Pay 3 000 ₽ per lesson, duration unknown',
    'Pay 3 000 ₽ net per lesson of 0 hours',
    'Pay 3 000 ₽ or 4 000 ₽ net per lesson of 1.5 hours',
  ]) {
    const result = answer({ pay: '80 000 ₽ net per month' }, { intro });
    assert.notEqual(result.salary?.guidance?.source, 'vacancy-pay');
    assert.equal(result.requiresReview, true);
  }
});

test('vacancy-specific Russian and English pay answers are excluded from reusable form learning', async () => {
  const store = createMemoryStore();
  const pairs = [
    'На какую оплату в час рассчитываете?',
    'Минимальная ставка в час',
    'Expected pay per lesson',
  ].map((question, index) => ({
    question,
    text: formPayAnswer,
    evidence: `form:pay:${index}`,
    url: 'https://example.test/form',
    field: field(question),
  }));
  assert.equal((await learnFormAnswerPairs(store, pairs)).saved, 0);
  assert.deepEqual(await store.query(() => true), []);
  const question = 'Опишите ваш опыт доставки и поставки товаров';
  const delivery = await learnFormAnswerPairs(store, [
    {
      question,
      text: 'Я организовал доставку продуктов.',
      evidence: 'form:delivery:1',
      url: 'https://example.test/form',
      field: field(question),
    },
  ]);
  assert.equal(delivery.saved, 1, 'delivery experience remains learnable');
});

test(
  'CLI and both Lino transports carry explicit vacancy guidance without a browser or knowledge writes',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    const directory = await mkdtemp(join(tmpdir(), 'form-pay-'));
    const server = await startServer({
      store,
      port: 0,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      forms: {
        reportWriter: null,
        openSession: () => assert.fail('read-only planning never launches'),
      },
      log: null,
    });
    try {
      const file = join(directory, 'inspection.json');
      const report = form('');
      await writeFile(file, JSON.stringify(report));
      const vacancy = {
        pay: '60 000–80 000 ₽ net per month',
        evidence: 'vacancy:hh:12',
      };
      const commands = createFormsCommands({
        openStore: async () => store,
        reportWriter: null,
      });
      const output = [];
      await commands['forms-plan'](
        { file, salary: encodeWire(salary), vacancy: encodeWire(vacancy) },
        (text) => output.push(JSON.parse(text))
      );
      assert.equal(output[0].fields[0].answer.salary.guidance.minimum, 476.19);
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/forms/plan`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire({ inspection: report, salary, vacancy }, type),
          }
        );
        assert.equal(response.status, 200);
        const result = await readWireResponse(response);
        assert.equal(result.fields[0].answer.salary.guidance.minimum, 476.19);
        assert.equal(
          result.fields[0].answer.salary.guidance.evidence,
          vacancy.evidence
        );
      }
      assert.deepEqual(await store.query(() => true), []);
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
