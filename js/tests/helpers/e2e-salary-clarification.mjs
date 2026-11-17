import { verifySalaryDraft } from './salary-draft-browser.mjs';
import {
  clarificationSalary as salary,
  salaryAnchor,
  salaryClarification as question,
  salaryClarificationAnswer as expected,
  salaryPhrasingQuestion,
  salaryPhrasingAnswer,
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
  await verifySalaryPhrasing(browser);
};

export const verifySalaryPhrasing = async (browser) => {
  console.log(
    '[salary-clarification-phrasing]',
    JSON.stringify(
      await verifySalaryDraft(browser, {
        question: salaryPhrasingQuestion,
        expected: salaryPhrasingAnswer,
        input: { salary, recent: [salaryAnchor] },
        screenshot: process.env.SALARY_PHRASING_SCREENSHOT,
      })
    )
  );
};
