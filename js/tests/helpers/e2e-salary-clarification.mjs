import assert from 'node:assert/strict';
import { questionBrowserServer } from '../../../experiments/issue-56/question-browser-server.mjs';
import { postQuestion } from './question-http.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';
import {
  clarificationSalary as salary,
  salaryAnchor,
  salaryClarification as question,
  salaryClarificationAnswer as expected,
} from '../../../experiments/issue-56/salary-clarification-fixture.mjs';

/** Native HH-shaped composer readback through the shared browser commander. */
export const verifySalaryClarification = async (browser) => {
  const fixture = await questionBrowserServer(browser);
  const call = async (action, input) =>
    postQuestion(fixture.base, `browser/${action}`, input, LINO_TEXT);
  const input = { source: 'hh', chat: '7', salary, recent: [salaryAnchor] };
  const capture = async () => {
    if (process.env.SALARY_CLARIFICATION_SCREENSHOT) {
      await fixture.page.screenshot({
        path: process.env.SALARY_CLARIFICATION_SCREENSHOT,
      });
    }
  };
  try {
    await fixture.reset({ freeText: true, question });
    const inspected = await call('inspect', input);
    await capture();
    assert.equal(inspected.status, 200);
    assert.equal(inspected.body.plan.text, expected);
    assert.deepEqual(await fixture.stats(), {
      clicks: 0,
      textSends: 0,
      draft: '',
    });
    const applied = await call('prefill', { id: inspected.body.id });
    assert.equal(applied.status, 200);
    const result = await fixture.stats();
    assert.deepEqual(result, { clicks: 0, textSends: 0, draft: expected });
    await capture();
    await fixture.reset({
      freeText: true,
      question,
      draft: 'Keep my own answer',
    });
    const owned = await call('inspect', input);
    const held = await call('prefill', { id: owned.body.id });
    assert.notEqual(held.status, 200);
    assert.deepEqual(await fixture.stats(), {
      clicks: 0,
      textSends: 0,
      draft: 'Keep my own answer',
    });
    console.log(
      '[salary-clarification]',
      JSON.stringify({
        draft: result.draft,
        currency: 'USD',
        basis: 'gross',
        textSends: 0,
        ownerDraftPreserved: true,
      })
    );
  } finally {
    await fixture.close();
  }
};
