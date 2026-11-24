import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { planAnswer } from '../src/automation/question-answers.js';
import {
  questionSimilarity,
  matchQuestion,
} from '../src/automation/question-match.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import {
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  subjectQuestions,
  seedSubjectAnswers,
} from '../../experiments/issue-56/forms-subject-fixture.mjs';

const rule = (question, text = 'Reviewed answer', extra = {}) => ({
  id: 'qa-rule:subject',
  question,
  answers: [{ text, count: 3, approved: true }],
  ...extra,
});
const question = (subject) =>
  `How many years of commercial development experience do you have with ${subject}?`;
const result = (saved, asked, extra = {}) =>
  planAnswer(asked, { rules: [rule(saved)], ...extra });

test('high token overlap cannot transfer an answer between distinct technologies or roles', () => {
  for (const [saved, asked] of [
    ['Go', 'C#'],
    ['C#', 'C++'],
    ['Java', 'JavaScript'],
    ['Docker', 'MongoDB'],
    ['AWS', 'Kubernetes'],
    ['Go', 'Lead'],
    ['FrobDB', 'OtherDB'],
  ]) {
    assert.equal(
      result(question(saved), question(asked)).match,
      'unanswered',
      `${saved} / ${asked}`
    );
    assert.equal(questionSimilarity(question(saved), question(asked)), 0);
  }
});

test('salary currencies and employment arrangements cannot borrow each other’s saved answers', () => {
  for (const [saved, asked] of [
    [
      'What are your expected monthly salary requirements in USD?',
      'What are your expected monthly salary requirements in RUB?',
    ],
    [
      'Какие ваши ожидания по зарплате в месяц в ₽?',
      'Какие ваши ожидания по зарплате в месяц в $?',
    ],
    [
      'Готовы ли вы рассмотреть оформление исключительно по ИП?',
      'Готовы ли вы рассмотреть оформление исключительно по ТК РФ?',
    ],
    [
      'Готовы ли вы рассмотреть оформление исключительно по ИП?',
      'Готовы ли вы рассмотреть оформление по ТК РФ? С ИП не сотрудничаем',
    ],
    [
      'Please provide your LinkedIn profile link for our recruitment team?',
      'Please provide your GitHub profile link for our recruitment team?',
    ],
  ]) {
    assert.equal(result(saved, asked).match, 'unanswered', asked);
  }
});

test('added subjects remain open; handles, remote and fulltime are qualifiers', () => {
  assert.equal(
    result(question('Go'), question('Go and Rust')).match,
    'unanswered'
  );
  assert.equal(
    result(question('Go and Rust'), question('Go')).match,
    'unanswered'
  );
  for (const extra of [' remote', ' fulltime', ' @username']) {
    const answer = result(
      subjectQuestions.saved,
      subjectQuestions.saved.replace('?', `${extra}?`)
    );
    assert.equal(answer.match, 'approximate');
    assert.equal(answer.requiresReview, true);
  }
});

test('known aliases preserve approximate review across languages and technical spellings', () => {
  for (const [saved, asked] of [
    ['Go', 'Golang'],
    ['C#', 'С#'],
    ['C#', 'CSharp'],
    ['C#', 'c-sharp'],
    ['C++', 'С++'],
    ['Docker', 'Докер'],
    ['JavaScript', 'JS'],
    ['RUB', '₽'],
  ]) {
    const answer = result(question(saved), question(asked));
    assert.equal(answer.match, 'approximate', `${saved} / ${asked}`);
    assert.equal(answer.text, 'Reviewed answer');
    assert.equal(answer.requiresReview, true);
  }
  assert.equal(
    result(question('FrobDB'), question('frobdb').replace('?', ' remote?'))
      .match,
    'approximate'
  );
  assert.equal(result(question('FrobDB'), question('frobdb')).match, 'exact');
});

test('a template gap cannot hide a new subject; explicit owner aliases and exact answers retain authority', () => {
  const template = 'How many years … development experience do you have?';
  assert.equal(
    matchQuestion(
      template,
      'How many years of Go development experience do you have?'
    ),
    null
  );
  assert.equal(
    matchQuestion(
      template,
      'How many years of commercial development experience do you have?'
    ),
    'template'
  );
  const answer = planAnswer(question('C#'), {
    rules: [
      rule(question('Go'), 'Owner approved both', {
        questions: [question('C#')],
      }),
    ],
  });
  assert.equal(answer.match, 'exact');
  assert.equal(answer.text, 'Owner approved both');
  assert.equal(
    result(question('Go'), question('Go'), { approximate: false }).match,
    'exact'
  );
  assert.equal(
    result(question('Go'), question('Golang'), { approximate: false }).match,
    'unanswered'
  );
});

test('form and chat previews share subject refusal, alias evidence, scopes and unchanged knowledge', async () => {
  const store = createMemoryStore();
  await seedSubjectAnswers(store);
  const before = JSON.stringify(await store.query());
  for (const [label, expected] of [
    [subjectQuestions.wrong, 'unanswered'],
    [subjectQuestions.correct, 'approximate'],
  ]) {
    const chat = await previewAnswer(store, { question: label });
    const form = await planFormAnswers(store, {
      inspection: inspection([field(label)]),
    });
    assert.equal(chat.match, expected);
    assert.equal(form.fields[0].answer.match, expected);
    assert.equal(form.fields[0].answer.text, chat.text);
    assert.equal(form.fields[0].answer.requiresReview, true);
  }
  assert.equal(JSON.stringify(await store.query()), before);
  await saveAnswerRule(
    store,
    rule(subjectQuestions.saved, 'Scoped', {
      sources: ['hh'],
      chats: ['vacancy-1'],
    })
  );
  const scoped = await previewAnswer(store, {
    question: subjectQuestions.correct,
    ruleIds: ['subject'],
    source: 'forms',
  });
  assert.equal(scoped.match, 'unanswered');
});

test(
  'CLI and both Lino transports use the same subject checks without launching browsers',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await seedSubjectAnswers(store);
    const report = inspection([
      field(subjectQuestions.wrong),
      field(subjectQuestions.correct),
    ]);
    const dir = await mkdtemp(join(tmpdir(), 'form-subject-'));
    const server = await startServer({
      store,
      port: 0,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      forms: {
        reportWriter: null,
        availability: async () => ({ available: false }),
        openSession: () => assert.fail('planning cannot open a browser'),
      },
    });
    const verify = (value) => {
      assert.equal(value.fields[0].answer.proposal, null);
      assert.equal(value.fields[1].answer.source, 'approximate');
      assert.equal(
        value.fields[1].answer.proposal.value,
        'Three years building Go services'
      );
      assert.equal(value.fields[1].answer.requiresReview, true);
    };
    try {
      const file = join(dir, 'inspection.json');
      await writeFile(file, JSON.stringify(report));
      const commands = createFormsCommands({
        openStore: async () => store,
        reportWriter: null,
      });
      const output = [];
      await commands['forms-plan']({ file }, (text) =>
        output.push(JSON.parse(text))
      );
      verify(output[0]);
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/forms/plan`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire({ inspection: report }, type),
          }
        );
        assert.equal(response.status, 200);
        verify(await readWireResponse(response));
      }
    } finally {
      await server.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
