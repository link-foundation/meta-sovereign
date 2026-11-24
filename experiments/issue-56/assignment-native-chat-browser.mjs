import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyHhAssignmentVacancyCapture } from '../../js/tests/helpers/e2e-hh-assignment-vacancy.mjs';
import { verifyHhAssignmentVacancyWatch } from '../../js/tests/helpers/e2e-hh-live-capture.mjs';

await runBrowserScenarios('hh-assignment-vacancy', [
  verifyHhAssignmentVacancyCapture,
  verifyHhAssignmentVacancyWatch,
]);
