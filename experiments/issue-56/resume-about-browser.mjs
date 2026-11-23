import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyResumeAboutEvidence } from '../../js/tests/helpers/e2e-resume-about.mjs';

await runBrowserScenarios('resume-about', [verifyResumeAboutEvidence]);
