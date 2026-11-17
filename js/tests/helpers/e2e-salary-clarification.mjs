import { verifySalaryDraft } from './salary-draft-browser.mjs';
import { verifySalaryBrowserContext } from './e2e-salary-browser-context.mjs';
import {
  clarificationSalary as salary,
  salaryAnchor,
  salaryClarification as question,
  salaryClarificationAnswer as expected,
  salaryPhrasingQuestion,
  salaryPhrasingAnswer,
  salaryNumberQuestion,
} from '../../../experiments/issue-56/salary-clarification-fixture.mjs';

const verifyDraft = async (browser, marker, text, answer, screenshot) => {
  console.log(
    `[${marker}]`,
    JSON.stringify(
      await verifySalaryDraft(browser, {
        question: text,
        expected: answer,
        input: { salary, recent: [salaryAnchor] },
        screenshot,
      })
    )
  );
};

export const verifySalaryClarification = async (browser) => {
  await verifyDraft(
    browser,
    'salary-clarification',
    question,
    expected,
    process.env.SALARY_CLARIFICATION_SCREENSHOT
  );
  await verifySalaryPhrasing(browser);
  await verifySalaryNumbers(browser);
  await verifySalaryBrowserContext(browser);
};

export const verifySalaryPhrasing = (browser) =>
  verifyDraft(
    browser,
    'salary-clarification-phrasing',
    salaryPhrasingQuestion,
    salaryPhrasingAnswer,
    process.env.SALARY_PHRASING_SCREENSHOT
  );

export const verifySalaryNumbers = (browser) =>
  verifyDraft(
    browser,
    'salary-clarification-numbers',
    salaryNumberQuestion,
    salaryPhrasingAnswer,
    process.env.SALARY_NUMBERS_SCREENSHOT
  );
