import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyResumeExports } from './helpers/e2e-resume-exports.mjs';

await runBrowserScenarios('resume-exports', [verifyResumeExports]);
