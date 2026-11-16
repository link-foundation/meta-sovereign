import assert from 'node:assert/strict';
import { questionBrowserServer } from '../../../experiments/issue-56/question-browser-server.mjs';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { newBrowserWatchId } from '../../src/automation/question-browser-watch.js';
import { LINO_TEXT } from '../../src/transport/lino.js';
import { postQuestion } from './question-http.mjs';

/** Actual browser-commander draft preparation, with a routed synthetic HH page. */
export const verifyQuestionPeriodWorkers = async (browser) => {
  const fixture = await questionBrowserServer(browser);
  const id = newBrowserWatchId();
  const call = async (action, input) => {
    const result = await postQuestion(
      fixture.base,
      `browser/${action}`,
      input,
      LINO_TEXT
    );
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  try {
    const question = 'Where do you live?';
    await fixture.reset({ freeText: true, question });
    await saveAnswerRule(fixture.store, {
      id: 'native-worker-period',
      question,
      answers: [
        { text: 'Vietnam', count: 4, approved: true },
        { text: 'Vietnam.', count: 1, approved: true },
      ],
    });
    const review = await call('inspect', {
      source: 'hh',
      chat: '7',
      answerFinalPeriod: 'without',
    });
    assert.equal(review.plan.text, 'Vietnam');
    assert.equal(review.plan.count, 5);
    await call('watch-start', { id, review: review.id, confirm: true });
    await fixture.page.waitForFunction(
      () => document.querySelector('textarea').value.length > 0,
      {},
      { timeout: 10000 }
    );
    const actual = await fixture.stats();
    if (process.env.QUESTION_PERIOD_WORKERS_SCREENSHOT) {
      await fixture.page.screenshot({
        path: process.env.QUESTION_PERIOD_WORKERS_SCREENSHOT,
      });
    }
    assert.deepEqual(actual, { clicks: 0, textSends: 0, draft: 'Vietnam' });
    assert.equal(
      (await fixture.store.get(review.id)).planning.answerFinalPeriod,
      'without'
    );
    console.log(
      '[question-period-workers]',
      JSON.stringify({
        overrideRetained: true,
        draft: actual.draft,
        sends: 0,
        observations: 5,
      })
    );
  } finally {
    await call('watch-stop', { id }).catch(() => {});
    await fixture.close();
  }
};
