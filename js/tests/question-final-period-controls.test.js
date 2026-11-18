import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { questionPeriodConfiguration } from '../src/cli/question-period-configuration.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  saveAnswerRule,
  previewAnswer,
  learnSavedAnswers,
} from '../src/automation/question-store.js';
import {
  readAnswerPolicy,
  saveAnswerPolicy,
} from '../src/automation/question-policy.js';
import { questionApi } from '../src/web/question-api.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { postQuestion } from './helpers/question-http.mjs';

const question = 'Where do you live?';
const rule = {
  id: 'qa-rule:period',
  question,
  answers: [
    { text: 'Vietnam', count: 4, approved: true, evidence: ['plain'] },
    { text: 'Vietnam.', count: 1, approved: true, evidence: ['period'] },
  ],
};

test(
  'period configuration uses isolated CLI, environment and Lino precedence without changing saved policy',
  { timeout: 5000 },
  async (t) => {
    const cwd = await mkdtemp(join(tmpdir(), 'ms-period-configuration-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const before = { ...process.env };
    const resolve = (args = {}, env = {}) =>
      questionPeriodConfiguration(args, { cwd, env });
    assert.equal(
      await resolve(),
      undefined,
      'missing configuration uses the saved preference'
    );
    await writeFile(join(cwd, '.lenv'), 'ANSWER_FINAL_PERIOD: "without"\n');
    assert.equal(await resolve(), 'without');
    await writeFile(join(cwd, 'selected.lenv'), 'ANSWER_FINAL_PERIOD: with\n');
    assert.equal(await resolve({ configuration: 'selected.lenv' }), 'with');
    assert.equal(
      await resolve(
        { configuration: 'selected.lenv' },
        { ANSWER_FINAL_PERIOD: 'without' }
      ),
      'without'
    );
    assert.equal(
      await resolve(
        { 'answer-final-period': 'with' },
        { ANSWER_FINAL_PERIOD: 'invalid-unused' }
      ),
      'with'
    );
    await assert.rejects(
      resolve({}, { ANSWER_FINAL_PERIOD: 'private-invalid' }),
      (error) =>
        /with or without/u.test(error.message) &&
        !error.message.includes('private-invalid')
    );
    for (const args of [
      { 'answer-final-period': true },
      { configuration: true },
      { configuration: '' },
    ]) {
      await assert.rejects(resolve(args));
    }
    assert.deepEqual({ ...process.env }, before);
  }
);

test(
  'CLI and offline policy save acknowledgements select period pairs without rewriting raw variants',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    try {
      await saveAnswerRule(store, rule);
      const original = await store.get(rule.id);
      const cli = createAutomationCommands({ openStore: async () => store });
      const output = [];
      assert.equal(
        await cli.automations(
          {
            _: ['answers', 'policy'],
            'answer-final-period': 'without',
            json: true,
          },
          (line) => output.push(line)
        ),
        0
      );
      assert.equal(
        JSON.parse(output.at(-1)).policy.answerFinalPeriod,
        'without'
      );
      assert.equal((await previewAnswer(store, { question })).text, 'Vietnam');
      await cli.automations(
        {
          _: ['answers', 'plan'],
          question,
          'answer-final-period': 'with',
          json: true,
        },
        (line) => output.push(line)
      );
      assert.equal(JSON.parse(output.at(-1)).text, 'Vietnam.');
      assert.equal(
        (await readAnswerPolicy(store)).answerFinalPeriod,
        'without'
      );
      const result = await previewAnswer(store, {
        question,
        answerFinalPeriod: 'with',
      });
      assert.equal(result.text, 'Vietnam.');
      assert.equal(result.count, 5);
      assert.deepEqual(result.evidence, ['plain', 'period']);
      const remote = { get: async () => null, report: async () => null };
      const api = questionApi({ store, remote });
      await api.saveAnswerPolicy({ answerFinalPeriod: 'with' });
      assert.equal((await api.answerPolicy()).answerFinalPeriod, 'with');
      remote.report = async () => ({ policy: { answerFinalPeriod: 'with' } });
      await assert.rejects(
        api.saveAnswerPolicy({ answerFinalPeriod: 'without' }),
        /not confirmed/u
      );
      assert.equal((await readAnswerPolicy(store)).answerFinalPeriod, 'with');
      await assert.rejects(
        saveAnswerPolicy(store, { answerFinalPeriod: 'invalid' }),
        /with or without/u
      );
      assert.deepEqual(await store.get(rule.id), original);
    } finally {
      await store.close?.();
    }
  }
);

test(
  'both Lino transports share period planning and reject invalid styles without changing policy',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const { server, base } = await formReviewHttp({ store }, LINO_TEXT);
    try {
      await saveAnswerRule(store, rule);
      for (const media of [LINO_TEXT, LINO_BINARY]) {
        const saved = await postQuestion(
          base,
          'policy',
          { policy: { answerFinalPeriod: 'without' } },
          media
        );
        assert.equal(saved.status, 200);
        assert.equal(saved.body.policy.answerFinalPeriod, 'without');
        const plan = await postQuestion(base, 'plan', { question }, media);
        assert.equal(plan.body.text, 'Vietnam');
        assert.equal(plan.body.count, 5);
        const invalid = await postQuestion(
          base,
          'policy',
          { policy: { answerFinalPeriod: 'invalid' } },
          media
        );
        assert.equal(invalid.status, 400);
        assert.equal(
          (await readAnswerPolicy(store)).answerFinalPeriod,
          'without'
        );
      }
    } finally {
      await server.close();
      await store.close?.();
    }
  }
);

test(
  'repeated archived learning preserves separate actual observations and combines only the reuse candidate',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    try {
      const messages = [];
      for (const [index, body] of [
        question,
        'Vietnam',
        question,
        'Vietnam.',
        question,
        'Vietnam',
      ].entries()) {
        messages.push({
          id: `msg:hh:period:${index}`,
          source: 'hh',
          chat: 'period',
          sender: index % 2 ? 'me' : 'them',
          body,
          timestamp: new Date(
            Date.UTC(2026, 10, 9, 10, 0, index)
          ).toISOString(),
        });
      }
      await store.putMany(messages);
      const learned = await learnSavedAnswers(store, { apply: true });
      assert.equal(learned.rules.length, 1);
      assert.equal(
        learned.rules[0].answers.reduce((sum, answer) => sum + answer.count, 0),
        3
      );
      const saved = learned.rules[0];
      await learnSavedAnswers(store, { apply: true });
      assert.deepEqual(await store.get(saved.id), saved);
      const preview = await previewAnswer(store, { question });
      assert.equal(preview.text, 'Vietnam.');
      assert.equal(preview.count, 3);
      assert.equal(
        preview.requiresReview,
        true,
        'learning never grants approval'
      );
      assert.deepEqual(
        await store.query((row) => row.id.startsWith('msg:')),
        messages
      );
    } finally {
      await store.close?.();
    }
  }
);
