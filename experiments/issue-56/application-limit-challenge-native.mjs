import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationLimitChallenge } from '../../js/tests/helpers/e2e-application-limit-challenge.mjs';
import { verifyNativeApplicationLimitBoundaries } from '../../js/tests/helpers/e2e-application-limit-boundaries.mjs';
await runBrowserScenarios('application-limit-challenge', [
  ...(process.argv.includes('--boundaries')
    ? [verifyNativeApplicationLimitBoundaries]
    : [
        (browser) =>
          verifyNativeApplicationLimitChallenge(browser, {
            checkBoundaries: !process.argv.includes('--parent-flow'),
          }),
      ]),
]);
