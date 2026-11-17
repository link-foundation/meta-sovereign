import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLanguage } from '../../js/tests/helpers/e2e-application-language.mjs';
import { verifyNativeApplicationResume } from '../../js/tests/helpers/e2e-application-resume.mjs';

await runBrowserScenarios('ci-application-context', [
  verifyNativeApplicationLanguage,
  verifyNativeApplicationResume,
]);
