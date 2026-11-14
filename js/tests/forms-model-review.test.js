import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createReviewedPrefill } from '../src/forms/review-prefill.js';
import { createFormReader } from '../src/forms/reader.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
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
  await seedModelAnswers(store);
  const calls = [];
  const report = inspection([field(modelQuestion, { tag: 'input', index: 0 })]);
  let writes = 0;
  const prefill = createReviewedPrefill({
    store,
    modelRunner: modelRunnerFixture(calls),
    inspect: async (_browser, options) => {
      options?.onSnapshot?.({});
      return globalThis.structuredClone(report);
    },
    capture: async () => ({
      get: (id) => id,
      check: async () => {},
      dispose: async () => {},
    }),
    write: async (_browser, _target, chosen) => {
      writes++;
      report.fields[0].value = chosen.answer.proposal.value;
    },
  });
  const record = { id: 'review-fixture', browser: {} };
  const plan = () =>
    prefill.plan(record, { modelDraft: true, approximate: false }, () => {});
  const apply = (proposed) =>
    prefill.apply(
      record,
      { planId: proposed.reviewPlan.id, fields: [report.fields[0].id] },
      () => {}
    );
  return {
    store,
    calls,
    report,
    record,
    plan,
    apply,
    get writes() {
      return writes;
    },
  };
};

test(
  'reviewed model fields apply with readback once and never make a second model request',
  { timeout: 5000 },
  async () => {
    const env = await setup();
    const plan = await env.plan();
    const result = await env.apply(plan);
    assert.equal(result.state, 'applied');
    assert.equal(result.receipts[0].status, 'applied');
    assert.equal(env.report.fields[0].value, modelText);
    assert.equal(env.calls.length, 1);
    assert.equal(env.writes, 1);
    assert.deepEqual(await env.apply(plan), result);
    assert.equal(env.writes, 1);
  }
);

test(
  'changed CV or owner DOM edit stops reviewed model writes before an interaction',
  { timeout: 5000 },
  async () => {
    for (const changed of ['cv', 'dom']) {
      const env = await setup();
      const plan = await env.plan();
      if (changed === 'cv') {
        await env.store.put({
          id: 'cv:model-fixture',
          cv: { basics: { summary: 'Owner edited CV' } },
        });
      } else {
        env.report.fields[0].value = 'Owner edited answer';
      }
      const result = await env.apply(plan);
      assert.equal(result.state, 'refused');
      assert.equal(
        result.code,
        changed === 'cv' ? 'form-answers-changed' : 'form-changed'
      );
      assert.equal(env.writes, 0);
      assert.equal(env.calls.length, 1);
    }
  }
);

test(
  'batch limits remain explicit and protected fields and invalid choices are never proposed',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await seedModelAnswers(store);
    const fields = Array.from({ length: 27 }, (_, index) =>
      field(`Unresolved question ${index}`)
    );
    fields.push(
      field('Password', {
        type: 'password',
        value: null,
        valueOmitted: 'password',
      })
    );
    const result = await planFormAnswers(
      store,
      { inspection: inspection(fields), approximate: false, modelDraft: true },
      {
        runner: async (input) => ({
          drafts: JSON.parse(input.prompt).questions.map(({ id }) => ({
            id,
            text: modelText,
            missing: [],
            evidence: ['cv:model-fixture'],
          })),
        }),
      }
    );
    assert.equal(result.planning.model.requested, 25);
    assert.equal(result.planning.model.omitted, 2);
    assert.equal(
      result.fields.filter((entry) => entry.answer.source === 'model').length,
      25
    );
    assert.equal(result.fields.at(-1).answer.reason, 'protected-field');
    const choice = await planFormAnswers(
      store,
      {
        inspection: inspection([
          field(modelQuestion, {
            type: 'select',
            options: [
              { label: 'Yes', value: 'yes', disabled: false, selected: false },
            ],
          }),
        ]),
        approximate: false,
        modelDraft: true,
      },
      { runner: modelRunnerFixture([]) }
    );
    assert.equal(choice.fields[0].answer.complete, false);
    assert.equal(choice.fields[0].answer.proposal, null);
  }
);

test(
  'reader stop aborts and drains an outstanding standalone model request',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await seedModelAnswers(store);
    let started;
    const began = new Promise((resolve) => {
      started = resolve;
    });
    let aborted = false;
    const reader = createFormReader({
      store,
      modelRunner: async ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('stopped'));
            },
            { once: true }
          );
          started();
        }),
    });
    const pending = reader.plan({
      inspection: inspection([field(modelQuestion)]),
      approximate: false,
      modelDraft: true,
    });
    const rejected = assert.rejects(pending, /stopped/u);
    await began;
    await reader.stop();
    await rejected;
    assert.equal(aborted, true);
  }
);
