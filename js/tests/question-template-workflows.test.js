import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/index.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { matchQuestion } from '../src/automation/question-match.js';
import {
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { questionApi } from '../src/web/question-api.js';
import { startQuestionFixtureServer } from './helpers/question-fixture-server.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  templateExample as example,
  templateBoundaryExample,
  templateLinkExample,
  templatePrefixExample,
  templateRequestExample,
  templateRule,
} from '../../experiments/issue-56/question-template-fixture.mjs';

test('ordered templates fold case and ё, with explicit case-sensitive opt-out', () => {
  assert.equal(matchQuestion(example.pattern, example.question), 'template');
  assert.equal(
    matchQuestion(example.pattern, example.question, { caseSensitive: true }),
    null
  );
  assert.equal(
    matchQuestion('Где … живёт*?', example.question, { caseSensitive: true }),
    'template'
  );
  assert.equal(
    matchQuestion(example.pattern.replace('…', '...'), example.question),
    'template'
  );
});

test('suffix and ordered bounded gaps cannot swallow another task or link', () => {
  const pattern = 'Do … experience*?';
  for (const question of [
    'Do experience?',
    'Do very very very very very very experiences?',
  ]) {
    assert.equal(matchQuestion(pattern, question), 'template', question);
  }
  for (const question of [
    'Do very very very very very very very experiences?',
    'Do experience extra?',
    'Experience do?',
    'Do preexperience?',
    'Do you have experience? Which city?',
    'Do call us experience?',
    'Do fill this form experience?',
    'Do https://example.test experience?',
  ]) {
    assert.equal(matchQuestion(pattern, question), null, question);
  }
});

test('wildcard spans preserve extra requests and clause boundaries', () => {
  for (const [pattern, question] of [
    [templateRequestExample.pattern, templateRequestExample.question],
    ['Do you … have experience?', 'Do you understand? have experience'],
    ['Where … live?', 'Where exactly. How old you live?'],
    ['Есть ли у вас опыт? …', 'Есть ли у вас опыт? Заодно заполните профиль.'],
    ['Есть ли у вас опыт? …', 'Есть ли у вас опыт? Пожалуйста, пройдите тест.'],
    ['Есть ли у вас опыт? …', 'Есть ли у вас опыт? И позвоните нам завтра.'],
    ['क्या आपको अनुभव है? …', 'क्या आपको अनुभव है? साथ ही फ़ॉर्म भरें।'],
    ['क्या आपको अनुभव है? …', 'क्या आपको अनुभव है? कल एक कॉल करें।'],
    ['您有相关经验吗？ …', '您有相关经验吗？ 也请预约面试。'],
    ['您有相关经验吗？ …', '您有相关经验吗？ 麻烦完成问卷。'],
  ]) {
    assert.equal(matchQuestion(pattern, question), null, question);
  }
});

test('a word-prefix wildcard cannot absorb an additional action joined to the saved word', () => {
  for (const [pattern, question] of [
    [templatePrefixExample.pattern, templatePrefixExample.question],
    ['您有相关经验*？', '您有相关经验面试？'],
    ['您有相关经验*？', '您有相关经验吗请您发送简历？'],
    ['у вас есть опыт*?', 'у вас есть опыт-позвоните?'],
    ['Do you have experience*?', 'Do you have experience-can-you-start?'],
    ['Do you have experience* …?', 'Do you have experience-can you start?'],
    ['क्या आपको अनुभव है*?', 'क्या आपको अनुभव है-कॉल-करें?'],
  ]) {
    assert.equal(matchQuestion(pattern, question), null, question);
  }
  for (const [pattern, question] of [
    ['Do you have experience*?', 'Do you have experiences?'],
    ['您有相关经验*？', '您有相关经验吗？'],
    ['Where do you live*?', 'Where do you live-work?'],
    ['Who send* your résumé?', 'Who sends your résumé?'],
  ]) {
    assert.equal(matchQuestion(pattern, question), 'template', question);
  }
});

test('ordinary wording and the saved request retain template approval', () => {
  for (const [pattern, question] of [
    ['Do you have … experience?', 'Do you have formal experience?'],
    ['Do you have … experience?', 'Do you have hands-on experience?'],
    ['Do you have experience? …', 'Do you have experience? Thanks.'],
    [
      'Do you have experience …?',
      'Do you have experience with distributed systems?',
    ],
    [
      'Do you have experience …?',
      'Do you have experience with distributed systems',
    ],
    ['Do you have … availability?', 'Do you have 9 a.m. availability?'],
    [
      'Hello. Do you have … experience?',
      'Hello! Do you have formal experience?',
    ],
    ['Please book … time', 'Please book some time'],
    ['Где … живёт*?', 'Где вы сейчас живете?'],
  ]) {
    assert.equal(matchQuestion(pattern, question), 'template', question);
  }
});

test('a wildcard cannot move a question or acquire a new sentence or ask', () => {
  for (const [pattern, question] of [
    [templateBoundaryExample.pattern, templateBoundaryExample.question],
    ['Do you have experience …?', templateBoundaryExample.question],
    [
      'Do you have experience …?',
      'Do you have experience with Python, and can you start Monday?',
    ],
    ['Есть ли у вас опыт? …', 'Есть ли у вас опыт. Завтра вам удобно?'],
    ['क्या आपको अनुभव है …?', 'क्या आपको अनुभव है। मंगलवार ठीक रहेगा?'],
    ['您有相关经验吗？ …', '您有相关经验吗。周二方便？'],
  ]) {
    assert.equal(matchQuestion(pattern, question), null, question);
  }
});

const verifyControlPlan = async (example, match, requiresReview) => {
  const store = createMemoryStore();
  const cli = createAutomationCommands({ openStore: async () => store });
  const lines = [];
  const run = (args) => cli.automations(args, (line) => lines.push(line));
  assert.equal(
    await run({
      _: ['answers', 'save'],
      id: example.id,
      question: example.pattern,
      answer: example.answer,
      approved: true,
    }),
    0
  );
  const api = questionApi({
    remote: { get: async () => null, report: async () => null },
    store,
  });
  assert.equal((await api.answerRules())[0].question, example.pattern);
  const plan = await api.previewAnswer({ question: example.question });
  assert.equal(plan.match, match);
  assert.equal(plan.text, match === 'unanswered' ? '' : example.answer);
  assert.equal(plan.requiresReview, requiresReview);
  assert.equal(
    await run({ _: ['answers', 'plan'], question: example.question }),
    0
  );
  // CLI defaults remain text Links Notation; no JSON compatibility flag needed.
  const { decodeWire } = await import('../src/transport/lino.js');
  const cliPlan = decodeWire(lines.at(-1));
  assert.equal(cliPlan.match, match);
  assert.equal(cliPlan.requiresReview, requiresReview);
};

test('CLI and offline controls preserve templates and hold added links or requests', async () => {
  await verifyControlPlan(example, 'template', false);
  await verifyControlPlan(templateLinkExample, 'approximate', true);
  await verifyControlPlan(templateRequestExample, 'unanswered', true);
  await verifyControlPlan(templateBoundaryExample, 'unanswered', true);
  await verifyControlPlan(templatePrefixExample, 'unanswered', true);
});

test(
  'text and binary Lino carry saved templates without JSON compatibility',
  { timeout: 20000 },
  async () => {
    const store = createMemoryStore();
    const server = await startQuestionFixtureServer({ store });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const call = async (method, path, input) => {
          const response = await fetch(
            `http://127.0.0.1:${server.port}/api/automations/answers${path}`,
            {
              method,
              headers: { accept: type, 'content-type': type },
              body: encodeWire(input, type),
            }
          );
          assert.equal(response.status, 200);
          return readWireResponse(response);
        };
        for (const [sample, match, requiresReview] of [
          [example, 'template', false],
          [templateLinkExample, 'approximate', true],
          [templateRequestExample, 'unanswered', true],
          [templateBoundaryExample, 'unanswered', true],
          [templatePrefixExample, 'unanswered', true],
        ]) {
          await call('PUT', '', {
            rule: {
              id: sample.id,
              question: sample.pattern,
              answers: [{ text: sample.answer, approved: true }],
            },
          });
          const plan = await call('POST', '/plan', {
            question: sample.question,
          });
          assert.equal(plan.match, match);
          assert.equal(plan.text, match === 'unanswered' ? '' : sample.answer);
          assert.equal(plan.requiresReview, requiresReview);
        }
      }
    } finally {
      await server.close();
    }
  }
);

test('saved template scope and approval survive the shared provider runner', async () => {
  for (const source of ['hh', 'telegram', 'vk', 'email', 'whatsapp']) {
    const store = createMemoryStore();
    await saveAnswerRule(
      store,
      templateRule({ sources: [source], chats: [`${source}:7`] })
    );
    const input = { question: example.question, source, chat: '7' };
    assert.equal(
      (await previewAnswer(store, { ...input, chat: '8' })).match,
      'unanswered'
    );
    assert.equal((await previewAnswer(store, input)).match, 'template');
    const automation = normalizeAutomation({
      id: 'templates',
      action: { kind: 'answer-questions' },
      conditions: { mutual: false, cooldownDays: 0 },
      pacing: { typing: false },
    });
    await store.put(automation);
    await store.put({
      id: `msg:${source}:7:1`,
      source,
      chat: '7',
      sender: 'them',
      body: example.question,
      timestamp: new Date().toISOString(),
    });
    const sent = [];
    const runner = createAutomationRunner({
      store,
      self: ['me'],
      send: async (draft) => {
        sent.push(draft);
        return { status: 'sent', messageId: '2' };
      },
    });
    const plan = await runner.plan(automation, {
      targets: [{ source, chat: '7' }],
    });
    assert.equal(plan.drafts.length, 1, source);
    assert.equal(plan.drafts[0].answer.match, 'template', source);
    assert.equal(
      (await runner.deliverDraft(automation, plan.drafts[0])).status,
      'sent'
    );
    assert.notEqual(
      (await runner.deliverDraft(automation, plan.drafts[0])).status,
      'sent'
    );
    assert.equal(sent.length, 1, source);
    assert.equal(sent[0].text, example.answer, source);
  }
});
