// Offline multilingual archive learning; no credentials or delivery.
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/src/storage/universal.js';
import { learnSavedAnswers } from '../js/src/automation/question-store.js';
import { encodeLinoValue } from '../js/src/transport/lino.js';

const store = createMemoryStore();
const pairs = [
  ['आप कहाँ रहते हैं', 'वियतनाम'],
  ['请介绍您的经验', '五年软件开发经验。'],
];
for (const [pair, [question, answer]] of pairs.entries()) {
  for (const [turn, body] of [question, answer].entries()) {
    await store.put({
      id: `msg:telegram:language-${pair}:${turn}`,
      source: 'telegram',
      chat: `language-${pair}`,
      sender: turn ? 'me' : 'interviewer',
      body,
      timestamp: `2026-11-09T10:00:0${turn}Z`,
    });
  }
}
const preview = await learnSavedAnswers(store);
assert.equal(preview.rules.length, 2);
assert.equal(preview.coverage.retained, 4);
for (const rule of preview.rules) {
  assert.equal(rule.answers[0].approved, false);
  assert.equal(rule.answers[0].count, 1);
}
console.log(encodeLinoValue(preview));
