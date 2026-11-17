import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { questionBrowserServer } from './question-browser-server.mjs';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { postQuestion } from '../../js/tests/helpers/question-http.mjs';
import { LINO_TEXT } from '../../js/src/transport/lino.js';
import {
  wordingSalary as salary,
  salaryWordingQuestion as question,
  salaryWordingRule,
} from './salary-wording-fixture.mjs';

// Run with --import ./experiments/issue-56/salary-wording-before.mjs.
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
const fixture = await questionBrowserServer(browser);
try {
  await saveAnswerRule(fixture.store, salaryWordingRule());
  await fixture.reset({ freeText: true, question });
  const review = await postQuestion(
    fixture.base,
    'browser/inspect',
    { source: 'hh', chat: '7', salary },
    LINO_TEXT
  );
  assert.equal(review.status, 200);
  assert.equal(review.body.plan.text, 'От 5 500 € в месяц на руки.');
  const applied = await postQuestion(
    fixture.base,
    'browser/prefill',
    { id: review.body.id },
    LINO_TEXT
  );
  assert.equal(applied.status, 200);
  const stats = await fixture.stats();
  assert.deepEqual(stats, {
    clicks: 0,
    textSends: 0,
    draft: review.body.plan.text,
  });
  await fixture.page.screenshot({
    path: 'docs/screenshots/issue-56-salary-wording-before.png',
  });
  console.log(
    JSON.stringify({ ...stats, parent: '59252a5e', ownerWordingLost: true })
  );
} finally {
  await fixture.close();
  await browser.close();
}
