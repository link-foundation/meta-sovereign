// One current-chat watch scenario with bounded metadata diagnostics and cleanup.
import { webkit } from 'playwright';
import { verifyQuestionBrowserWatch } from '../../js/tests/helpers/e2e-question-browser-watch.mjs';

const browser = await webkit.launch({ headless: true });
try {
  console.log(
    JSON.stringify(
      await verifyQuestionBrowserWatch(browser, {
        screenshots: 'docs/screenshots/issue-56-watch-disclosure',
      })
    )
  );
} finally {
  await browser.close();
}
