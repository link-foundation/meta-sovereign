import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyJobResumes } from './helpers/e2e-job-resumes.mjs';

await runBrowserScenarios('job-resumes', [verifyJobResumes]);
