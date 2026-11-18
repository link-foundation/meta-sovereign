import { resolve } from 'node:path';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyDockerRunnerProfile } from '../../js/tests/helpers/e2e-runner-profile.mjs';

await runBrowserScenarios('runner-docker', [
  (browser) =>
    verifyDockerRunnerProfile(browser, {
      screenshots: resolve('docs/screenshots/issue-56-runner-docker'),
    }),
]);
