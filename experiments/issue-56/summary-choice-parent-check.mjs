import assert from 'node:assert/strict';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { previewAnswer } from '../../js/src/automation/question-store.js';
import {
  summaryChoiceMessage,
  summaryChoiceInput,
} from './summary-choice-fixture.mjs';
const store = createMemoryStore();
await store.put(summaryChoiceMessage());
const answer = await previewAnswer(store, summaryChoiceInput);
assert.equal(answer.text, '');
assert.equal(answer.requiresReview, true);
assert.equal(answer.acceptedSummary, undefined);
console.log(
  JSON.stringify({
    parent: '7e0e2f4d',
    acceptedSummaryMissing: true,
    text: answer.text,
    requiresReview: true,
  })
);
