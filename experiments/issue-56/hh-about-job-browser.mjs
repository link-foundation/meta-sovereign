import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyHhAboutJob } from '../../js/tests/helpers/e2e-cv-hh-about-job.mjs';

await runBrowserScenarios('hh-about-job', [verifyHhAboutJob]);
