import { verifySalaryDraft } from './salary-draft-browser.mjs';
import { clarificationSalary as salary } from '../../../experiments/issue-56/salary-clarification-fixture.mjs';
import {
  employerSalaryQuestion as question,
  employerSalaryAnswer as expected,
  mountEmployerSalary,
} from '../../../experiments/issue-56/salary-employer-context-fixture.mjs';

export const verifySalaryEmployerContext = async (browser) => {
  const receipt = await verifySalaryDraft(browser, {
    question,
    expected:
      process.env.SALARY_EMPLOYER_EXPECT_OWNER === '1'
        ? 'From $6 000 net per month.'
        : expected,
    input: { salary },
    prepare: mountEmployerSalary,
    screenshot: process.env.SALARY_EMPLOYER_SCREENSHOT,
  });
  console.log('[salary-employer-context]', JSON.stringify(receipt));
};
