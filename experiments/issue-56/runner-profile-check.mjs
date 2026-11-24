import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import { verifyRunnerProfile } from '../../js/tests/helpers/e2e-runner-profile.mjs';
import { publishedWebBundle } from './published-web-bundle.mjs';

const parent = '060b17210d84275ebd7e8bfb65d60aefe7c1a77e';
const before = process.argv.includes('--before');
const beforeBundle = before
  ? await publishedWebBundle(parent, ['js/src/web/settings-runner.js'])
  : undefined;
const browser = await webkit.launch({ headless: true });
try {
  const work = () =>
    verifyRunnerProfile(browser, {
      screenshots: 'docs/screenshots',
      beforeBundle,
    });
  if (before) {
    await assert.rejects(work(), (error) =>
      /data-runner-profile-open/.test(error.message)
    );
    console.log(
      JSON.stringify({
        parent,
        missingProfileEditor: true,
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
