import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import { verifyRunnerHealth } from '../../js/tests/helpers/e2e-runner-health.mjs';
import { publishedWebBundle } from './published-web-bundle.mjs';

const parent = '0e595743098e0bfbe2cecdd4bda2b550c3a026c9';
const before = process.argv.includes('--before');
const beforeBundle = before
  ? await publishedWebBundle(parent, ['js/src/web/settings-runner.js'])
  : undefined;
const browser = await webkit.launch({ headless: true });
try {
  const work = () =>
    verifyRunnerHealth(browser, {
      screenshots: 'docs/screenshots',
      beforeBundle,
    });
  if (before) {
    await assert.rejects(work(), (error) =>
      /data-runner-action=inspect/.test(error.message)
    );
    console.log(
      JSON.stringify({
        parent,
        missingApplicationCheck: true,
        regressionFails: true,
        liveProvider: false,
      })
    );
  } else {
    console.log(JSON.stringify(await work()));
  }
} finally {
  await browser.close();
}
