import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyResumeExports } from './helpers/e2e-resume-exports.mjs';
import { verifyResumeAboutEvidence } from './helpers/e2e-resume-about.mjs';

await runBrowserScenarios('resume-exports', [
  verifyResumeAboutEvidence,
  verifyResumeExports,
]);
