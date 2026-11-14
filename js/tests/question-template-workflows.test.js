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

test('CLI, offline controls and persisted rules share literal template syntax', async () => {
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
  assert.equal(plan.match, 'template');
  assert.equal(plan.text, example.answer);
  assert.equal(plan.requiresReview, false);
  assert.equal(
    await run({ _: ['answers', 'plan'], question: example.question }),
    0
  );
  // CLI defaults remain text Links Notation; no JSON compatibility flag needed.
  const { decodeWire } = await import('../src/transport/lino.js');
  assert.equal(decodeWire(lines.at(-1)).match, 'template');
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
        await call('PUT', '', { rule: templateRule() });
        const plan = await call('POST', '/plan', {
          question: example.question,
        });
        assert.equal(plan.match, 'template');
        assert.equal(plan.text, example.answer);
        assert.equal(plan.requiresReview, false);
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
