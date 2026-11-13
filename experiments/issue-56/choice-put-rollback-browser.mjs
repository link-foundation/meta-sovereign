import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyChoicePutRollback } from '../../js/tests/helpers/e2e-choice-put-rollback.mjs';

const before = process.argv.includes('--before');
await runBrowserScenarios('choice-put-rollback', [
  (browser) =>
    verifyChoicePutRollback(browser, {
      before,
      screenshots: 'docs/screenshots/issue-56-choice-put-rollback',
    }),
]);
