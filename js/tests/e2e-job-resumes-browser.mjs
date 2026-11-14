import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyJobResumes } from './helpers/e2e-job-resumes.mjs';
import { verifyResumeLanguage } from './helpers/e2e-resume-language.mjs';
import { verifyResumeCacheRecovery } from './helpers/e2e-resume-cache.mjs';

await runBrowserScenarios('job-resumes', [
  verifyJobResumes,
  verifyResumeLanguage,
  verifyResumeCacheRecovery,
]);
