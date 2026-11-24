import assert from 'node:assert/strict';
import { verifySalaryDraft } from './salary-draft-browser.mjs';
import { questionBrowserServer } from '../../../experiments/issue-56/question-browser-server.mjs';
import { mountSalaryHistory } from '../../../experiments/issue-56/salary-browser-history.mjs';
import { postQuestion } from './question-http.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';
import {
  clarificationSalary as salary,
  salaryAnchor,
  salaryNumberQuestion as question,
  salaryPhrasingAnswer as expected,
} from '../../../experiments/issue-56/salary-clarification-fixture.mjs';

export const verifySalaryContextGuard = async (browser) => {
  const fixture = await questionBrowserServer(browser);
  const call = (action, input) =>
    postQuestion(fixture.base, `browser/${action}`, input, LINO_TEXT);
  try {
    await fixture.reset({ freeText: true, question });
    await mountSalaryHistory(fixture, [salaryAnchor]);
    const inspected = await call('inspect', {
      source: 'hh',
      chat: '7',
      salary,
    });
    assert.equal(inspected.body.plan.text, expected);
    await fixture.page.evaluate(() => {
      document.querySelector('#history p').textContent = 'What is your role?';
    });
    const refused = await call('prefill', { id: inspected.body.id });
    assert.notEqual(refused.status, 200);
    assert.deepEqual(await fixture.stats(), {
      clicks: 0,
      textSends: 0,
      draft: '',
    });
    console.log(
      '[salary-browser-context-guard]',
      JSON.stringify({ refused: true, textSends: 0, draft: '' })
    );
  } finally {
    await fixture.close();
  }
};

export const verifySalaryBrowserContext = async (browser) => {
  const receipt = await verifySalaryDraft(browser, {
    question,
    expected,
    input: { salary },
    recent: [salaryAnchor],
    screenshot: process.env.SALARY_BROWSER_CONTEXT_SCREENSHOT,
  });
  console.log('[salary-browser-context]', JSON.stringify(receipt));
  await verifySalaryContextGuard(browser);
};
