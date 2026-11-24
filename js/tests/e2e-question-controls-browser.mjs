import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyQuestionBrowserControls } from './helpers/e2e-question-browser-controls.mjs';
import { verifySummaryChoices } from './helpers/e2e-summary-choice.mjs';
import { verifyQuestionBrowserWatch } from './helpers/e2e-question-browser-watch.mjs';
import { verifyQuestionPeriodWorkers } from './helpers/e2e-question-period-workers.mjs';

// Keep the existing focused experiment entry points while CI gives salary
// contexts and wording their own unchanged three-minute execution budgets.
const salaryGroup = [
  ['PRIORITY', 'context'],
  ['TEMPLATE_CONTEXT', 'context'],
  ['INTENT', 'wording'],
  ['VOCABULARY', 'wording'],
  ['WORDING', 'wording'],
  ['CLARIFICATION', 'context'],
].find(([flag]) => process.env[`SALARY_${flag}_ONLY`] === '1')?.[1];
if (salaryGroup) {
  await import(`./e2e-question-salary-${salaryGroup}-browser.mjs`);
} else {
  await runBrowserScenarios(
    'question-controls',
    process.env.QUESTION_PERIOD_WORKERS_ONLY === '1'
      ? [verifyQuestionPeriodWorkers]
      : [
          verifyQuestionBrowserControls,
          verifySummaryChoices,
          verifyQuestionBrowserWatch,
          verifyQuestionPeriodWorkers,
        ]
  );
}
