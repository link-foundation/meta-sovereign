import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createReviewedPrefill } from '../../js/src/forms/review-prefill.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from '../../js/tests/helpers/forms-plan-inspection.mjs';
import {
  seedModelAnswers,
  modelQuestion,
  modelRunnerFixture,
} from './forms-model-fixture.mjs';

/** Shared single-field review/readback fixture for explicit and private CVs. */
export const modelReviewFixture = async ({
  store = createMemoryStore(),
  seed = seedModelAnswers,
} = {}) => {
  await seed(store);
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
  const plan = (input = {}) =>
    prefill.plan(
      record,
      { modelDraft: true, approximate: false, ...input },
      () => {}
    );
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
    prefill,
    plan,
    apply,
    get writes() {
      return writes;
    },
  };
};
