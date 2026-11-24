import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  readAnswerModel,
  saveAnswerModel,
} from '../src/automation/answer-model-config.js';
import { prepareAnswerModelContext } from '../src/automation/answer-model-context.js';
import {
  prepareAnswerPreview,
  previewAnswer,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import { answerModelApi } from '../src/web/answer-model-api.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  seedModelAnswers,
  modelRunnerFixture,
  modelQuestion,
  modelText,
} from '../../experiments/issue-56/forms-model-fixture.mjs';

const setup = async () => {
  const store = createMemoryStore();
  const seeded = await seedModelAnswers(store);
  const calls = [];
  const runner = modelRunnerFixture(calls);
  const input = {
    modelDraft: true,
    approximate: false,
    profileId: seeded.profile.id,
    inspection: inspection([
      field('Full name', { value: 'Owner answer' }),
      field(modelQuestion),
      field('Starting date for this vacancy?'),
    ]),
  };
  return { store, ...seeded, calls, runner, input };
};

test(
  'model settings start disabled and persist with a revision; stale and malformed saves do not change them',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const initial = await readAnswerModel(store);
    assert.equal(initial.enabled, false);
    assert.equal(initial.revision, null);
    const saved = await saveAnswerModel(store, {
      enabled: true,
      model: 'sonnet',
      revision: null,
    });
    assert.equal((await readAnswerModel(store)).revision, saved.revision);
    await assert.rejects(
      saveAnswerModel(store, { enabled: false, revision: null }),
      { code: 'answer-model-changed' }
    );
    for (const invalid of [
      { timeoutMs: 0 },
      { timeoutMs: 120001 },
      { enabled: 'true' },
      { model: '--tools' },
      { cvId: '/private/cv.pdf' },
      { provider: 'unsupported' },
    ]) {
      await assert.rejects(saveAnswerModel(store, { ...saved, ...invalid }), {
        code: 'answer-model-config',
      });
    }
    assert.equal((await readAnswerModel(store)).enabled, true);
  }
);

test(
  'one model batch handles only unresolved fields, keeps owner content and deterministic answers, and marks unknown facts',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const result = await planFormAnswers(env.store, env.input, {
      runner: env.runner,
    });
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].questions.length, 2);
    assert.equal(env.calls[0].context.cv.id, 'cv:model-fixture');
    assert.equal(env.calls[0].context.cv.values.basics.summary, modelText);
    assert.equal(result.fields[0].answer.source, 'profile');
    assert.equal(result.fields[0].answer.preserveCurrent, true);
    const drafted = result.fields[1].answer;
    assert.equal(drafted.source, 'model');
    assert.deepEqual(drafted.proposal, { value: modelText });
    assert.equal(drafted.requiresReview, true);
    assert.deepEqual(drafted.evidence, ['cv:model-fixture']);
    const unknown = result.fields[2].answer;
    assert.equal(unknown.reason, 'model-clarification');
    assert.match(unknown.text, /\[clarify: What starting date/);
    assert.equal(unknown.proposal, null);
    assert.equal(result.planning.model.used, true);
    const frozen = await planFormAnswers(env.store, env.input, {
      frozen: result,
      runner: () => assert.fail('apply must not call a model'),
    });
    assert.deepEqual(frozen.fields, result.fields);
    assert.equal(env.calls.length, 1);
  }
);

test(
  'frozen model answers refuse changed CV, profile, rules, policy or model settings',
  { timeout: 5000 },
  async () => {
    const mutations = [
      async (env) =>
        env.store.put({
          id: 'cv:model-fixture',
          cv: { basics: { summary: 'Changed CV' } },
        }),
      async (env) => {
        env.input = { ...env.input, profile: { name: 'Changed owner' } };
      },
      async (env) =>
        saveAnswerRule(env.store, {
          id: 'extra',
          question: 'New question',
          answers: [{ text: 'New answer', approved: true }],
        }),
      async (env) =>
        saveAnswerPolicy(env.store, { rejected: ['unrelated rejection'] }),
      async (env) =>
        saveAnswerModel(env.store, { ...env.settings, model: 'opus' }),
    ];
    for (const mutate of mutations) {
      const env = await setup();
      const frozen = await planFormAnswers(env.store, env.input, {
        runner: env.runner,
      });
      await mutate(env);
      await assert.rejects(planFormAnswers(env.store, env.input, { frozen }), {
        code: 'form-answers-changed',
      });
      assert.equal(env.calls.length, 1);
    }
  }
);

test(
  'disabled, unavailable and invalid responses preserve deterministic output and expose a truthful model state',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const original = await planFormAnswers(env.store, {
      ...env.input,
      modelDraft: false,
    });
    assert.equal(env.calls.length, 0);
    const unavailable = await planFormAnswers(env.store, env.input);
    assert.equal(unavailable.planning.model.state, 'unavailable');
    for (const drafts of [
      [],
      [
        {
          id: 'invented',
          text: 'Wrong',
          missing: [],
          evidence: ['cv:model-fixture'],
        },
      ],
      [null, null],
      [
        {
          id: env.input.inspection.fields[1].id,
          text: 'Unsupported',
          missing: [],
          evidence: ['nonexistent'],
        },
        {
          id: env.input.inspection.fields[2].id,
          text: '',
          missing: ['Date?'],
          evidence: [],
        },
      ],
    ]) {
      const result = await planFormAnswers(env.store, env.input, {
        runner: async () => ({ drafts }),
      });
      assert.equal(result.planning.model.state, 'refused');
      assert.deepEqual(result.fields, original.fields);
    }
    await saveAnswerModel(env.store, { ...env.settings, enabled: false });
    const disabled = await planFormAnswers(env.store, env.input, {
      runner: () => assert.fail('disabled'),
    });
    assert.equal(disabled.planning.model.state, 'disabled');
    await assert.rejects(
      planFormAnswers(env.store, { ...env.input, modelDraft: 'true' }),
      { code: 'answer-model-config' }
    );
  }
);

test(
  'context includes only closest approved rendered answers and respects explicit CV and byte limits',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    await saveAnswerRule(env.store, {
      id: 'unapproved',
      question: modelQuestion,
      answers: [{ text: 'Private unapproved variant', approved: false }],
    });
    await saveAnswerRule(env.store, {
      id: 'missing',
      question: modelQuestion,
      answers: [{ text: '{{notKnown}}', approved: true }],
    });
    const { context } = await prepareAnswerPreview(env.store, {
      profileId: env.profile.id,
    });
    const prepared = await prepareAnswerModelContext(env.store, context, [
      modelQuestion,
    ]);
    assert.equal(prepared.knowledge.answers.length, 1);
    assert.equal(prepared.knowledge.answers[0].id, 'qa-rule:model-nearby');
    await env.store.delete('cv:model-fixture');
    await assert.rejects(
      prepareAnswerModelContext(env.store, context, [modelQuestion]),
      { code: 'answer-model-cv' }
    );
    await env.store.put({
      id: 'cv:model-fixture',
      cv: { basics: { summary: 'x'.repeat(128001) } },
    });
    await assert.rejects(
      prepareAnswerModelContext(env.store, context, [modelQuestion]),
      { code: 'answer-model-context' }
    );
  }
);

test(
  'question preview shares the model adapter, preserves exact answers and rejects invalid choice output',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const result = await previewAnswer(
      env.store,
      { question: `${modelQuestion}?`, approximate: false, modelDraft: true },
      {
        runner: async () => ({
          drafts: [
            {
              id: 'question',
              text: modelText,
              missing: [],
              evidence: ['cv:model-fixture'],
            },
          ],
        }),
      }
    );
    assert.equal(result.match, 'model');
    assert.equal(result.complete, true);
    assert.equal(result.requiresReview, true);
    const choice = await previewAnswer(
      env.store,
      {
        question: `${modelQuestion}?`,
        options: ['Yes', 'No'],
        approximate: false,
        modelDraft: true,
      },
      {
        runner: async () => ({
          drafts: [
            {
              id: 'question',
              text: modelText,
              missing: [],
              evidence: ['cv:model-fixture'],
            },
          ],
        }),
      }
    );
    assert.equal(choice.complete, false);
    assert.equal(choice.optionMismatch, true);
    const exact = await previewAnswer(
      env.store,
      { question: 'What interfaces have you built?', modelDraft: true },
      { runner: () => assert.fail('exact answer preserved') }
    );
    assert.equal(exact.match, 'exact');
    assert.equal(exact.model.state, 'unneeded');
  }
);

test(
  'model API refuses missing status and unconfirmed saves without a local fallback',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const input = { ...env.settings, model: 'sonnet' };
    let reply = null;
    const api = answerModelApi({
      remote: { get: async () => reply, report: async () => reply },
    });
    await assert.rejects(api.answerModel(), {
      code: 'answer-model-unconfirmed',
    });
    for (const response of [
      {},
      { settings: env.settings },
      { settings: { ...env.settings, revision: 'bad' } },
      { settings: { ...input, ok: true, revision: env.settings.revision } },
    ]) {
      reply = response;
      await assert.rejects(api.saveAnswerModel(input), {
        code: 'answer-model-unconfirmed',
      });
    }
    reply = { settings: await saveAnswerModel(env.store, input) };
    assert.equal((await api.saveAnswerModel(input)).settings.model, 'sonnet');
  }
);
