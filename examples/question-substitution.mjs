// Configured, reviewable answer reuse without provider traffic or network I/O.
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/src/storage/index.js';
import {
  saveAnswerRule,
  previewAnswer,
} from '../js/src/automation/question-store.js';

const store = createMemoryStore();
const question = 'How can we contact you?';
const salary = {
  enabled: true,
  approved: true,
  defaultCurrency: 'USD',
  currencies: [{ code: 'USD', keywords: ['USD', '$'], net: 6000 }],
};
const saved = await saveAnswerRule(store, {
  id: 'contacts',
  question,
  contract: true,
  profile: { email: 'owner@example.test' },
  salary,
  answers: [
    { text: 'Email owner@example.test; salary $6 000 net.', approved: true },
  ],
});
assert.equal(
  saved.answers[0].text,
  'Email {{email}}; salary {{salary_net_usd}} net.'
);
const answer = await previewAnswer(store, {
  question,
  profile: { email: 'next@example.test' },
  salary,
});
assert.equal(answer.text, 'Email next@example.test; salary $6 000 net.');
assert.equal(answer.requiresReview, false);
console.log(saved.answers[0].text);
console.log(answer.text);
