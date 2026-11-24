import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyHiddenQuestionLinks } from '../../js/tests/helpers/e2e-question-hidden-links.mjs';

await runBrowserScenarios('ci-question-link-locator', [
  verifyHiddenQuestionLinks,
]);
