import assert from 'node:assert/strict';
import { listAnswerRules } from '../../src/automation/question-store.js';

/** Preservation must associate the actual native answers with the saved draft. */
export const assertApplicationAnswerObservation = (rows, receipt) => {
  const observation = rows.find((row) =>
    row.id.startsWith('secret:jobs-application-answers:')
  );
  assert.equal(observation.draftId, receipt.draft.id);
  assert.deepEqual(
    observation.fields.map((field) => field.value),
    receipt.draft.fields.map((field) => field.value)
  );
  return observation;
};

/** Automatic and explicit deferral share the same unapproved learning policy. */
export const assertUnapprovedApplicationLearning = async (fixture) => {
  assert(
    (await listAnswerRules(fixture.store)).every((rule) =>
      rule.answers.every((answer) => !answer.approved)
    )
  );
};
