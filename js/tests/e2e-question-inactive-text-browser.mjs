import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyInactiveText } from './helpers/e2e-inactive-text.mjs';

await runBrowserScenarios('question-inactive-text', [verifyInactiveText], {
  nativeFocus: true,
});
