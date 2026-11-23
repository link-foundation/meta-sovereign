import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvSaveWatch } from './helpers/e2e-cv-save-watch.mjs';
import { verifyCvWatchWorkplace } from './helpers/e2e-cv-watch-workplace.mjs';
import { verifyCvWatchCreatedWorkplace } from './helpers/e2e-cv-created-workplace.mjs';
import { verifyCvWorkplaceFollowup } from './helpers/e2e-cv-workplace-followup.mjs';

await runBrowserScenarios('cv-save-watch', [
  verifyCvSaveWatch,
  verifyCvWatchWorkplace,
  verifyCvWatchCreatedWorkplace,
  verifyCvWorkplaceFollowup,
]);
