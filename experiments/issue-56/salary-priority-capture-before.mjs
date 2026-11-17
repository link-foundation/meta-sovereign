import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifySalaryDraft } from '../../js/tests/helpers/salary-draft-browser.mjs';
import {
  prioritySalary as salary,
  priorityQuestion as question,
  priorityVacancy as vacancy,
  priorityExpected as expected,
} from './salary-priority-fixture.mjs';

await runBrowserScenarios('salary-priority-before', [
  async (browser) => {
    await verifySalaryDraft(browser, {
      question,
      expected,
      input: { salary, vacancy },
      screenshot: 'docs/screenshots/issue-56-salary-priority-before.png',
    });
  },
]);
