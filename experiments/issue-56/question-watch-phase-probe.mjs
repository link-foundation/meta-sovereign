// One finite mock watch: observe persisted phases without relying on poll timing.
import assert from 'node:assert/strict';
import { questionWatchFixture } from './question-watch-fixture.mjs';
import { wholeTurnSnapshot, pendingRules } from './whole-turn-fixture.mjs';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';

const env = await questionWatchFixture();
const phases = [];
const put = env.store.put;
env.store.put = async (record, ...args) => {
  if (
    record.kind === 'question-browser-watch' &&
    phases.at(-1) !== record.phase
  ) {
    phases.push(record.phase);
  }
  return put(record, ...args);
};
try {
  await saveAnswerRule(env.store, pendingRules()[0]);
  env.state.snapshot = wholeTurnSnapshot();
  const review = await env.browser.inspect(env.review.target);
  await env.browser.watchStart({ ...env.input, review: review.id });
  const settled = await env.until((status) => status.phase === 'owner-draft');
  assert(phases.includes('prefilled'));
  assert.equal(env.state.prefills.length, 1);
  assert.equal(env.state.sends.length, 0);
  const legacyPredicate =
    settled.state === 'paused' ||
    ['review', 'prefilled', 'sent', 'failed'].includes(settled.phase);
  assert.equal(legacyPredicate, false);
  console.log(
    JSON.stringify({
      phases,
      settled: settled.phase,
      prefills: env.state.prefills.length,
      sends: env.state.sends.length,
      legacyPredicate,
    })
  );
} finally {
  await env.browser.close();
}
