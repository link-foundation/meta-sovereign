import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyResumeCacheRecovery } from '../../js/tests/helpers/e2e-resume-cache.mjs';

await runBrowserScenarios('resume-cache', [verifyResumeCacheRecovery]);
