import { verifySalaryDraft } from './salary-draft-browser.mjs';
import {
  wordingSalary as salary,
  salaryWordingQuestion as question,
  salaryWordingExpected as expected,
  salaryWordingRule,
} from '../../../experiments/issue-56/salary-wording-fixture.mjs';

export const verifySalaryWording = async (browser) => {
  console.log(
    '[salary-wording]',
    JSON.stringify(
      await verifySalaryDraft(browser, {
        question,
        expected,
        input: { salary },
        rules: [salaryWordingRule()],
        screenshot: process.env.SALARY_WORDING_SCREENSHOT,
      })
    )
  );
};
