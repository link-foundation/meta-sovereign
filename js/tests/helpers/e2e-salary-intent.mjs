import { verifySalaryDraft } from './salary-draft-browser.mjs';
import {
  intentSalary as salary,
  salaryIntentQuestion as question,
  salaryIntentExpected as expected,
} from '../../../experiments/issue-56/salary-intent-fixture.mjs';

export const verifySalaryIntent = async (browser) => {
  console.log(
    '[salary-intent]',
    JSON.stringify(
      await verifySalaryDraft(browser, {
        question,
        expected,
        input: { salary },
        screenshot: process.env.SALARY_INTENT_SCREENSHOT,
      })
    )
  );
};
