import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { webkit } from 'playwright';
import { verifyRunnerFeedback } from '../../js/tests/helpers/e2e-runner-feedback.mjs';

const parent = process.argv.includes('--parent');
const options = { screenshots: 'docs/screenshots/issue-56-runner-feedback' };
if (parent) {
  options.beforeBundle = execFileSync(
    'git',
    ['show', 'a493e1cf:js/src/web/app.min.js'],
    { maxBuffer: 16 * 1024 ** 2 }
  );
}
const browser = await webkit.launch({ headless: true });
try {
  if (parent) {
    await assert.rejects(
      verifyRunnerFeedback(browser, options),
      /locator\.waitFor: Timeout.*exceeded/s
    );
    console.log(
      JSON.stringify({ parentMissingConfirmation: true, liveProvider: false })
    );
  } else {
    console.log(JSON.stringify(await verifyRunnerFeedback(browser, options)));
  }
} finally {
  await browser.close();
  console.log(JSON.stringify({ resourcesClosed: true, liveProvider: false }));
}
