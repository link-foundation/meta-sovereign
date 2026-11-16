import test from 'node:test';
import assert from 'node:assert/strict';
import { planAnswer } from '../src/automation/question-answers.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { postQuestion } from './helpers/question-http.mjs';

const question = 'Where do you live?';
const rules = () =>
  ['Vietnam', 'Vietnam.'].map((text, index) => ({
    id: `qa-rule:period-scope-${index}`,
    question,
    answers: [
      {
        text,
        count: index ? 1 : 4,
        approved: true,
        evidence: [`turn:${index}`],
      },
    ],
  }));

test(
  'one exact question combines period observations across independently saved rules',
  { timeout: 5000 },
  () => {
    const saved = rules();
    const before = globalThis.structuredClone(saved);
    for (const selected of [saved, [...saved].reverse()]) {
      for (const answerFinalPeriod of ['with', 'without']) {
        const result = planAnswer(question, {
          rules: selected,
          policy: { answerFinalPeriod },
        });
        assert.equal(
          result.text,
          answerFinalPeriod === 'with' ? 'Vietnam.' : 'Vietnam'
        );
        assert.equal(result.count, 5);
        assert.equal(result.requiresReview, false);
        assert.deepEqual(
          new Set(result.evidence),
          new Set(['turn:0', 'turn:1'])
        );
      }
    }
    assert.deepEqual(saved, before);
  }
);

test(
  'question-wide period counts retain provider, chat and question eligibility',
  { timeout: 5000 },
  () => {
    const saved = rules();
    const excluded = [
      { sources: ['vk'] },
      { chats: ['other'] },
      { question: 'Which city is the office in?' },
      { enabled: false },
    ].map((scope, index) => ({
      ...saved[1],
      id: `qa-rule:excluded-${index}`,
      ...scope,
      answers: [{ ...saved[1].answers[0], count: 99 }],
    }));
    const result = planAnswer(question, {
      rules: [...saved, ...excluded],
      source: 'hh',
      chat: 'current',
    });
    assert.equal(result.text, 'Vietnam.');
    assert.equal(result.count, 5);
    assert.equal(result.requiresReview, false);
  }
);

test(
  'overlapping period observations remain separate and require review under either punctuation policy',
  { timeout: 5000 },
  () => {
    const saved = rules();
    saved[1].answers[0].evidence = [...saved[0].answers[0].evidence];
    // Keep this in one rule as well: the same observation is never two sends.
    saved[0].answers.push(saved[1].answers[0]);
    for (const punctuationEquivalent of [false, true]) {
      const result = planAnswer(question, {
        rules: [saved[0]],
        policy: { punctuationEquivalent },
      });
      assert.equal(result.requiresReview, true);
      assert.equal(result.count, 4);
      assert.equal(result.alternatives.length, 2);
    }
  }
);

test(
  'CLI and both Lino transports expose combined question counts without rewriting saved rules',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const { server, base } = await formReviewHttp({ store }, LINO_TEXT);
    try {
      for (const rule of rules()) {
        await saveAnswerRule(store, rule);
      }
      const before = await store.query((row) => row.id.startsWith('qa-rule:'));
      const cli = createAutomationCommands({ openStore: async () => store });
      const output = [];
      assert.equal(
        await cli.automations(
          { _: ['answers', 'plan'], question, json: true },
          (line) => output.push(line)
        ),
        0
      );
      assert.equal(JSON.parse(output.at(-1)).text, 'Vietnam.');
      assert.equal(JSON.parse(output.at(-1)).count, 5);
      for (const media of [LINO_TEXT, LINO_BINARY]) {
        const result = await postQuestion(
          base,
          'plan',
          { question, answerFinalPeriod: 'without' },
          media
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.text, 'Vietnam');
        assert.equal(result.body.count, 5);
      }
      assert.deepEqual(
        await store.query((row) => row.id.startsWith('qa-rule:')),
        before
      );
    } finally {
      await server.close();
      await store.close?.();
    }
  }
);
