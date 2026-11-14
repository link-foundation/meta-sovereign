import assert from 'node:assert/strict';
import { listAnswerRules } from '../../src/automation/question-store.js';

/** Automatic and explicit deferral share the same unapproved learning policy. */
export const assertUnapprovedApplicationLearning = async (fixture) => {
  assert(
    (await listAnswerRules(fixture.store)).every((rule) =>
      rule.answers.every((answer) => !answer.approved)
    )
  );
};
