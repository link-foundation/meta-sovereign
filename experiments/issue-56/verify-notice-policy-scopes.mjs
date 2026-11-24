import { execFileSync } from 'node:child_process';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNoticePolicyScopes } from '../../js/tests/helpers/e2e-notice-policy-scopes.mjs';

const before = process.argv.includes('--before');
const parentBundle = before
  ? execFileSync(
      'git',
      [
        'show',
        'c9cc71433e9acd99e0370643aa784857bd6bfe49:js/src/web/app.min.js',
      ],
      { maxBuffer: 12 * 1024 * 1024 }
    )
  : undefined;
const verifyScopedNotices = (browser) =>
  verifyNoticePolicyScopes(browser, { parentBundle });
await runBrowserScenarios('question-notice-policy', [verifyScopedNotices], {
  nativeFocus: true,
});
