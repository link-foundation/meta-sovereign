import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyInactiveHistory } from './helpers/e2e-inactive-history.mjs';

await runBrowserScenarios(
  'question-inactive-history',
  [verifyInactiveHistory],
  { nativeFocus: true }
);
