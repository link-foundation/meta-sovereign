import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryDraft } from '../../js/tests/helpers/salary-draft-browser.mjs';
import {
  contextSalary as salary,
  salaryTemplateQuestion as question,
  salaryTemplateRule,
} from './salary-template-context-fixture.mjs';

await runBrowserScenarios('salary-template-context-before', [
  async (browser) => {
    console.log(
      '[wrong-currency-draft]',
      JSON.stringify(
        await verifySalaryDraft(browser, {
          question,
          expected: 'I expect $6 000, negotiable.',
          input: { salary },
          rules: [salaryTemplateRule()],
          screenshot:
            'docs/screenshots/issue-56-salary-template-context-before.png',
        })
      )
    );
  },
]);
