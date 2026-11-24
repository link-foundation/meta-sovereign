import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationAnswerContext } from '../../js/tests/helpers/e2e-application-answer-context.mjs';

await runBrowserScenarios('application-answer-context', [
  verifyNativeApplicationAnswerContext,
]);
