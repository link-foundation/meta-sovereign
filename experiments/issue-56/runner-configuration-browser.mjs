import { resolve } from 'node:path';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyLayeredRunnerProfile } from '../../js/tests/helpers/e2e-runner-profile.mjs';

await runBrowserScenarios('runner-configuration', [
  (browser) =>
    verifyLayeredRunnerProfile(browser, {
      screenshots: resolve('docs/screenshots/issue-56-runner-configuration'),
      beforeLayers: process.argv.includes('--before'),
    }),
]);
