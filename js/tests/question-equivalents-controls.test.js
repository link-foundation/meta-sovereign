import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import {
  saveAnswerRule,
  previewAnswer,
  learnSavedAnswers,
} from '../src/automation/question-store.js';
import { questionApi } from '../src/web/question-api.js';
import {
  encodeLinoValue,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { postQuestion } from './helpers/question-http.mjs';
import {
  question,
  preferred,
  aliases,
  wordingRule,
  wordingMessages,
} from '../../experiments/issue-56/answer-equivalents-fixture.mjs';

test(
  'CLI saves literal wording preferences, reloads edited Lino and clears missing aliases without sending',
  { timeout: 10000 },
  async (t) => {
    const store = createMemoryStore();
    const directory = await mkdtemp(join(tmpdir(), 'ms-wording-cli-'));
    t.after(async () => {
      await store.close?.();
      await rm(directory, { recursive: true, force: true });
    });
    const commands = createAutomationCommands({
      openStore: async () => store,
      send: async () => assert.fail('preference saves never send'),
    });
    const output = [];
    const run = (args) =>
      commands.automations({ ...args, json: true }, (line) =>
        output.push(line)
      );
    const rule = wordingRule();
    assert.equal(
      await run({
        _: ['answers', 'save'],
        id: rule.id,
        question,
        answer: preferred,
        approved: true,
        'equivalent-answer': aliases[0],
      }),
      0
    );
    assert.deepEqual((await store.get(rule.id)).answers[0].equivalents, [
      aliases[0],
    ]);
    const file = join(directory, 'preference.lino');
    const edited = {
      ...rule,
      answers: [
        {
          ...rule.answers[0],
          text: 'One to two weeks after receiving an offer.',
        },
      ],
    };
    await writeFile(file, encodeLinoValue(edited));
    assert.equal(await run({ _: ['answers', 'save', file] }), 0);
    assert.equal(
      (await previewAnswer(store, { question })).text,
      edited.answers[0].text
    );
    await writeFile(
      file,
      encodeLinoValue({ ...rule, answers: [{ text: preferred }] })
    );
    assert.equal(await run({ _: ['answers', 'save', file] }), 0);
    assert.equal((await store.get(rule.id)).answers[0].equivalents, undefined);
  }
);

test(
  'offline saves require the actual equivalent-wording acknowledgement and keep the saved rule on refusal',
  { timeout: 10000 },
  async (t) => {
    const store = createMemoryStore();
    t.after(() => store.close?.());
    const remote = { get: async () => null, report: async () => null };
    const api = questionApi({ store, remote });
    const { rule } = await api.saveAnswerRule(wordingRule());
    assert.deepEqual(rule.answers[0].equivalents, aliases);
    remote.report = async () => ({
      rule: { ...rule, answers: [{ ...rule.answers[0], equivalents: [] }] },
    });
    await assert.rejects(api.saveAnswerRule(rule), /not confirmed/u);
    assert.deepEqual(await store.get(rule.id), rule);
    remote.report = async () => ({
      status: 'failed',
      error: 'Saved wording refusal',
    });
    await assert.rejects(api.saveAnswerRule(rule), /Saved wording refusal/u);
    assert.deepEqual(await store.get(rule.id), rule);
  }
);

test(
  'both Lino routes retain equivalent wording and reject invalid declarations before mutation',
  { timeout: 10000 },
  async (t) => {
    const store = createMemoryStore();
    const { server, base } = await formReviewHttp({ store }, LINO_TEXT);
    t.after(async () => {
      await server.close();
      await store.close?.();
    });
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const rule = wordingRule();
      const saved = await postQuestion(base, 'save', { rule }, media);
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.body.rule.answers[0].equivalents, aliases);
      const invalid = await postQuestion(
        base,
        'save',
        {
          rule: {
            ...rule,
            answers: [{ ...rule.answers[0], equivalents: [true] }],
          },
        },
        media
      );
      assert.equal(invalid.status, 400);
      const preview = await postQuestion(base, 'plan', { question }, media);
      assert.equal(preview.body.text, preferred);
      assert.deepEqual(
        (await store.get(rule.id)).answers[0].equivalents,
        aliases
      );
    }
  }
);

test(
  'real archived learning projects four preferred uses without changing messages or replaying counts',
  { timeout: 10000 },
  async (t) => {
    const store = createMemoryStore();
    t.after(() => store.close?.());
    const rule = wordingRule();
    rule.answers[0].canonical = true;
    await saveAnswerRule(store, rule);
    const messages = wordingMessages();
    await store.putMany(messages);
    await learnSavedAnswers(store, { apply: true });
    const learned = await store.query((row) => row.id.startsWith('qa-rule:'));
    const first = await previewAnswer(store, {
      question,
      source: 'hh',
      chat: 'wording',
    });
    assert.equal(first.text, preferred);
    assert.equal(first.count, 4);
    assert.equal(first.requiresReview, false);
    await learnSavedAnswers(store, { apply: true });
    assert.deepEqual(
      await store.query((row) => row.id.startsWith('qa-rule:')),
      learned
    );
    assert.deepEqual(
      await store.query((row) => row.id.startsWith('msg:')),
      messages
    );
    assert.equal(
      (await previewAnswer(store, { question, source: 'hh' })).count,
      4
    );
    assert.equal((await store.get(rule.id)).answers[0].count, 0);
  }
);
