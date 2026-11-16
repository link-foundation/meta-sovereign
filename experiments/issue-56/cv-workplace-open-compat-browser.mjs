import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyCvWorkplaceFields } from '../../js/tests/helpers/e2e-cv-workplace-fields.mjs';
import { verifyCvWorkplaceMembership } from '../../js/tests/helpers/e2e-cv-workplace-membership.mjs';

// Only the two native paths affected by the retained resumeFrom editor context.
await runBrowserScenarios('cv-workplace-open-compat', [
  verifyCvWorkplaceFields,
  verifyCvWorkplaceMembership,
]);
