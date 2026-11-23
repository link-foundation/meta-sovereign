import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyHhWorkplaceJob } from '../../js/tests/helpers/e2e-cv-hh-workplace-job.mjs';

await runBrowserScenarios('hh-workplace-job', [verifyHhWorkplaceJob]);
