import assert from 'node:assert/strict';
import { automaticFormEnvironment } from '../../js/tests/helpers/forms-auto-prefill-fixture.mjs';
import { pendingPrefill } from '../../js/src/forms/challenge-wait.js';

const started = Date.now();
const events = [];
const timers = {
  setTimeout(run, ms) {
    return setTimeout(() => {
      events.push({
        event: 'timer-fired',
        ms,
        elapsedMs: Date.now() - started,
      });
      run();
    }, ms);
  },
  clearTimeout,
};
const env = await automaticFormEnvironment(2, {
  review: {
    deadlineMs: 100,
    timers,
    challenge: { waitMs: 2000, pollMs: 5 },
  },
});
try {
  env.report.challenge = { active: true, kind: 'captcha' };
  const initial = await env.prefill();
  assert.equal(initial.state, 'waiting-owner');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(
    env.reader.prefillStatus({
      id: env.session.id,
      requestId: initial.requestId,
    }).state,
    'waiting-owner'
  );
  env.hooks.check = async () => {
    events.push({ event: 'guard-started', elapsedMs: Date.now() - started });
    await new Promise((resolve) => setTimeout(resolve, 120));
  };
  delete env.report.challenge;
  let result = initial;
  let failure;
  for (let count = 0; count < 100 && pendingPrefill(result); count++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    try {
      result = env.reader.prefillStatus({
        id: env.session.id,
        requestId: initial.requestId,
      });
    } catch (error) {
      failure = error.code;
      if (failure === 'form-session-missing') {
        break;
      }
    }
  }
  console.log(
    JSON.stringify({ failure, events, textWrites: env.textWrites.length })
  );
  assert.equal(failure, 'form-session-missing');
  assert.ok(
    events.some((event) => event.event === 'timer-fired' && event.ms <= 100)
  );
  assert.equal(env.textWrites.length, 0);
} finally {
  await env.reader.stop();
}
