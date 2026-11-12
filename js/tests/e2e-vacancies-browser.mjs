import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyVacancies } from './helpers/e2e-vacancies.mjs';
import { verifyJobResumes } from './helpers/e2e-job-resumes.mjs';
import { verifyResumeExports } from './helpers/e2e-resume-exports.mjs';

await runBrowserScenarios('vacancies', [
  verifyVacancies,
  verifyJobResumes,
  verifyResumeExports,
]);
