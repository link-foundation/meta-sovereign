import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyJobResumes } from '../../js/tests/helpers/e2e-job-resumes.mjs';

await runBrowserScenarios('resume-validation', [verifyJobResumes]);
