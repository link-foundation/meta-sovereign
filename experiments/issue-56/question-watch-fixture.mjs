import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  questionBrowserFixture,
  browserTarget,
} from './question-browser-fixture.mjs';
import { createQuestionBrowser } from '../../js/src/automation/question-browser.js';
import { newBrowserWatchId } from '../../js/src/automation/question-browser-watch.js';

/** Finite mock provider, shared by focused lifecycle and transport regressions. */
export const questionWatchFixture = async (options = {}) => {
  const env = await questionBrowserFixture(options);
  await env.browser.close();
  const state = Object.assign(env.state, { opens: 0, closes: 0 });
  env.send.answerWatchSources = env.send.choiceSources;
  env.send.openAnswerWatch = async () => {
    state.opens++;
    await options.opening?.();
    return {
      async read() {
        await options.reading?.(state);
        return globalThis.structuredClone(state.snapshot);
      },
      async prefill(expected, text, verify) {
        await options.prefilling?.();
        await verify();
        state.prefills.push({ expected, text });
        state.snapshot.hasDraft = true;
        return { prefilled: true };
      },
      async select(draft, verify) {
        await options.selecting?.();
        await verify();
        return env.send(draft);
      },
      async close() {
        state.closes++;
      },
    };
  };
  const browser = createQuestionBrowser({ ...env, watchIntervalMs: 3 });
  const review = await browser.inspect(browserTarget);
  const input = { id: newBrowserWatchId(), review: review.id, confirm: true };
  const until = async (predicate) => {
    for (let tries = 0; tries < 250; tries++) {
      const status = await browser.watchStatus(input);
      if (predicate(status)) {
        return status;
      }
      await delay(4);
    }
    assert.fail('The bounded watcher condition was not reached.');
  };
  return { ...env, browser, review, input, until };
};

export const questionWatchGate = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
