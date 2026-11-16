import assert from 'node:assert/strict';
import { publishedWebBundle } from './published-web-bundle.mjs';
import { webkit } from 'playwright';
import { verifyRunnerSessions } from '../../js/tests/helpers/e2e-runner-sessions.mjs';

const parent = 'aa897f694df94471bb6fa713c5b1733397985b5b';
const beforeBundle = await publishedWebBundle(parent, [
  'js/src/web/dom.js',
  'js/src/web/settings-view.js',
  'js/src/web/locales/index.js',
]);
const browser = await webkit.launch({ headless: true });
try {
  await assert.rejects(
    verifyRunnerSessions(browser, { beforeBundle }),
    (error) => /data-runner-settings/.test(error.message)
  );
  console.log(
    JSON.stringify({
      parent,
      regressionFails: true,
      missingRunnerControls: true,
      liveProvider: false,
    })
  );
} finally {
  await browser.close();
}
