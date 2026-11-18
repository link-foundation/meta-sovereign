import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyResumeExports } from '../../js/tests/helpers/e2e-resume-exports.mjs';
import { verifyCvWatchWorkplace } from '../../js/tests/helpers/e2e-cv-watch-workplace.mjs';

await runBrowserScenarios('resume-area-focused', [
  verifyResumeExports,
  verifyCvWatchWorkplace,
]);
