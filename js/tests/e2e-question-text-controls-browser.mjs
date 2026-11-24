import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyQuestionTextControls } from './helpers/e2e-question-text-controls.mjs';

await runBrowserScenarios('question-text-controls', [
  verifyQuestionTextControls,
]);
