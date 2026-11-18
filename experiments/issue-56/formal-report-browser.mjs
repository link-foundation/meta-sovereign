import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvFormalReports } from '../../js/tests/helpers/e2e-cv-formal-report.mjs';
import { verifyCvExperiencePlans } from '../../js/tests/helpers/e2e-cv-experience-plan.mjs';
import { verifyCvExperienceDocuments } from '../../js/tests/helpers/e2e-cv-experience-documents.mjs';

await runBrowserScenarios('formal-report-focused', [
  verifyCvFormalReports,
  verifyCvExperiencePlans,
  verifyCvExperienceDocuments,
]);
