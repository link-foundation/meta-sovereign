import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/index.js';
import {
  listAnswerRules,
  learnSavedAnswers,
  saveAnswerRule,
  previewAnswer,
} from '../src/automation/question-store.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { checkForm, toForm } from '../src/web/automations-model.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { startServer } from '../src/server/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const rule = {
  id: 'city',
  question: 'Где вы живете?',
  answers: [{ text: 'Живу в {{city}}.', count: 0, approved: true }],
};
const seed = async (store) => {
  for (const [id, sender, body] of [
    [1, 'them', 'Где вы живете?'],
    [2, 'me', 'Вьетнам'],
  ]) {
    await store.put({
      id: `msg:hh:1:${id}`,
      source: 'hh',
      chat: '1',
      sender,
      body,
      timestamp: `2026-11-09T10:00:0${id}Z`,
    });
  }
};

test('preview validates profiles and respects the selected rule set', async () => {
  const store = createMemoryStore();
  await saveAnswerRule(store, rule);
  assert.equal(
    (
      await previewAnswer(store, {
        question: rule.question,
        ruleIds: ['qa-rule:other'],
      })
    ).match,
    'unanswered'
  );
  await assert.rejects(
    previewAnswer(store, { question: rule.question, profile: { city: 123 } }),
    /profile field/u
  );
  await assert.rejects(
    saveAnswerRule(store, { ...rule, id: 'qa-rule:' }),
    /identifier/u
  );
});

test('learn previews are read-only and repeated apply preserves counts and approvals', async () => {
  const store = createMemoryStore();
  await seed(store);
  const proposal = await learnSavedAnswers(store);
  assert.equal(proposal.rules.length, 1);
  assert.equal(proposal.coverage.retained, 2);
  assert.equal(proposal.rules[0].answers[0].approved, false);
  assert.deepEqual(await listAnswerRules(store), []);
  await learnSavedAnswers(store, { apply: true });
  const learned = (await listAnswerRules(store))[0];
  learned.answers[0].approved = true;
  await saveAnswerRule(store, learned);
  await learnSavedAnswers(store, { apply: true });
  const [again] = await listAnswerRules(store);
  assert.equal(again.answers[0].count, 1);
  assert.equal(again.answers[0].approved, true);
});

test('CLI and offline editor share answer storage, plan, delete and failures', async () => {
  const store = createMemoryStore();
  const cli = createAutomationCommands({
    openStore: async () => store,
    send: async () => {
      throw new Error('must not send');
    },
  });
  const output = [];
  assert.equal(
    await cli.automations(
      {
        _: ['answers', 'save'],
        id: 'city',
        question: rule.question,
        answer: 'Вьетнам',
        approved: true,
        json: true,
      },
      (line) => output.push(line)
    ),
    0
  );
  const remote = { get: async () => null, report: async () => null };
  const api = questionApi({ remote, store });
  assert.equal((await api.answerRules()).length, 1);
  assert.equal(
    (await api.previewAnswer({ question: rule.question })).text,
    'Вьетнам'
  );
  assert.equal(
    await cli.automations(
      { _: ['answers', 'plan'], question: rule.question, json: true },
      (line) => output.push(line)
    ),
    0
  );
  assert.equal(JSON.parse(output.at(-1)).match, 'exact');
  remote.report = async () => ({
    error: 'disk full',
    code: 'network',
    status: 'failed',
  });
  await assert.rejects(
    api.saveAnswerRule({ ...rule, answers: [{ text: 'Changed' }] }),
    /disk full/u
  );
  assert.equal((await api.answerRules())[0].answers[0].text, 'Вьетнам');
  remote.report = async () => null;
  await api.deleteAnswerRule('city');
  assert.deepEqual(await api.answerRules(), []);
});

test('question automation survives the editor and accepts editable profile fields', () => {
  const automation = normalizeAutomation({
    id: 'answers',
    action: {
      kind: 'answer-questions',
      profile: { city: 'Nha Trang', experience: 'First line\nSecond line' },
      ruleIds: ['qa-rule:city'],
    },
  });
  const form = toForm(automation);
  assert.deepEqual(checkForm(form, automation).automation, automation);
  const edited = checkForm(
    { ...form, profile: { ...form.profile, city: 'Hanoi' } },
    automation
  ).automation;
  assert.equal(edited.action.profile.city, 'Hanoi');
  assert.equal(edited.action.profile.experience, 'First line\nSecond line');
});

test(
  'answer CRUD, previews and learning use the default text and binary Lino API',
  { timeout: 20000 },
  async () => {
    const store = createMemoryStore();
    await seed(store);
    const server = await startServer({
      store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
    });
    const call = async (method, path, input, type = LINO_TEXT) => {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/automations/answers${path}`,
        {
          method,
          headers: { accept: type, 'content-type': type },
          body: input === undefined ? undefined : encodeWire(input, type),
        }
      );
      return {
        status: response.status,
        body: await readWireResponse(response),
      };
    };
    try {
      assert.equal((await call('PUT', '', { rule })).status, 200);
      const preview = await call(
        'POST',
        '/plan',
        { question: rule.question, profile: { city: 'Nha Trang' } },
        LINO_BINARY
      );
      assert.equal(preview.body.text, 'Живу в Nha Trang.');
      assert.equal(preview.body.requiresReview, false);
      assert.equal((await call('GET', '')).body.rules.length, 1);
      assert.deepEqual((await call('GET', '/policy')).body.policy.rejected, []);
      const policy = await call(
        'PUT',
        '/policy',
        { rejected: ['Живу в Nha Trang.'], punctuationEquivalent: true },
        LINO_BINARY
      );
      assert.equal(policy.body.policy.punctuationEquivalent, true);
      assert.equal(
        (
          await call('POST', '/plan', {
            question: rule.question,
            profile: { city: 'Nha Trang' },
          })
        ).body.text,
        ''
      );
      assert.equal(
        (await call('POST', '/policy', { rejected: [null] })).status,
        400
      );
      assert.equal(
        (await call('GET', '/policy')).body.policy.rejected.length,
        1
      );
      const learning = await call('POST', '/learn', { apply: false });
      assert.equal(learning.body.applied, false);
      assert.equal(learning.body.rules.length, 1);
      assert.equal(
        (await call('PUT', '', { rule: { ...rule, question: '' } })).status,
        400
      );
      assert.equal(
        (await call('DELETE', '/city')).body.deleted,
        'qa-rule:city'
      );
      assert.deepEqual((await call('GET', '')).body.rules, []);
    } finally {
      await server.close();
    }
  }
);
