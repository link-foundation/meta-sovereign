import { verifySalaryDraft } from './salary-draft-browser.mjs';
import {
  clarificationSalary as salary,
  salaryAnchor,
  salaryClarification as question,
  salaryClarificationAnswer as expected,
} from '../../../experiments/issue-56/salary-clarification-fixture.mjs';

export const verifySalaryClarification = async (browser) => {
  console.log(
    '[salary-clarification]',
    JSON.stringify(
      await verifySalaryDraft(browser, {
        question,
        expected,
        input: { salary, recent: [salaryAnchor] },
        screenshot: process.env.SALARY_CLARIFICATION_SCREENSHOT,
      })
    )
  );
};
