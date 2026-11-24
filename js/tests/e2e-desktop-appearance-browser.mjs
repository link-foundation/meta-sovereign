import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyDesktopAppearance } from './helpers/e2e-desktop-appearance.mjs';

await runBrowserScenarios('desktop-appearance', [verifyDesktopAppearance]);
