import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyQuestionBrowserControls } from './helpers/e2e-question-browser-controls.mjs';
import { verifySummaryChoices } from './helpers/e2e-summary-choice.mjs';
import { verifyQuestionBrowserWatch } from './helpers/e2e-question-browser-watch.mjs';

await runBrowserScenarios('question-controls', [
  verifyQuestionBrowserControls,
  verifySummaryChoices,
  verifyQuestionBrowserWatch,
]);
