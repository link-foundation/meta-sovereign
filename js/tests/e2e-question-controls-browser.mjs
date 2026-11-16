import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyQuestionBrowserControls } from './helpers/e2e-question-browser-controls.mjs';
import { verifySummaryChoices } from './helpers/e2e-summary-choice.mjs';
import { verifyQuestionBrowserWatch } from './helpers/e2e-question-browser-watch.mjs';
import { verifyQuestionPeriodWorkers } from './helpers/e2e-question-period-workers.mjs';

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
