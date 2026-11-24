import { verifySalaryDraft } from './salary-draft-browser.mjs';
import {
  contextSalary as salary,
  salaryTemplateQuestion as question,
  salaryTemplateExpected as expected,
  salaryTemplateRule,
} from '../../../experiments/issue-56/salary-template-context-fixture.mjs';

export const verifySalaryTemplateContext = async (browser) => {
  console.log(
    '[salary-template-context]',
    JSON.stringify(
      await verifySalaryDraft(browser, {
        question,
        expected,
        input: { salary },
        rules: [salaryTemplateRule()],
        screenshot: process.env.SALARY_TEMPLATE_CONTEXT_SCREENSHOT,
      })
    )
  );
};
