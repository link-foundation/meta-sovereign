import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeHhContent } from '../../js/tests/helpers/e2e-hh-content.mjs';
import { verifyCvWorkplacePreparation } from '../../js/tests/helpers/e2e-cv-workplace-prepare.mjs';

await runBrowserScenarios('hh-content', [
  process.argv.includes('--workplace')
    ? verifyCvWorkplacePreparation
    : verifyNativeHhContent,
]);
