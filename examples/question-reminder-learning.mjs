// Preview reusable answers offline. No credentials, approval or delivery.
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/src/storage/universal.js';
import { learnSavedAnswers } from '../js/src/automation/question-store.js';
import { encodeLinoValue } from '../js/src/transport/lino.js';

const store = createMemoryStore();
const question = 'Describe your experience with Kubernetes.';
const answer = 'Operated a cluster of twelve nodes.';
for (const [id, sender, body] of [
  [1, 'them', question],
  [2, 'them', 'Can we continue our conversation?'],
  [3, 'me', 'Hello!'],
  [4, 'me', answer],
]) {
  await store.put({
    id: `msg:telegram:reminder:${id}`,
    source: 'telegram',
    chat: 'reminder',
    sender,
    body,
    timestamp: `2026-11-09T10:00:0${id}Z`,
  });
}
const preview = await learnSavedAnswers(store);
assert.equal(preview.rules[0].question, question);
assert.equal(preview.rules[0].answers[0].text, answer);
assert.equal(preview.rules[0].answers[0].approved, false);
assert.deepEqual(preview.rules[0].answers[0].evidence, [
  'msg:telegram:reminder:4',
]);
console.log(encodeLinoValue(preview));
