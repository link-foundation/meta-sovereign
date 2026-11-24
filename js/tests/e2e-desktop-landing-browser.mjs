import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyDesktopLanding } from './helpers/e2e-desktop-landing.mjs';

await runBrowserScenarios('desktop-landing-availability', [
  verifyDesktopLanding,
]);
