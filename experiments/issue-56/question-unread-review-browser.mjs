import { chromium } from 'playwright';
import { verifyQuestionUnreadControls } from '../../js/tests/helpers/e2e-question-unread-controls.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyQuestionUnreadControls(browser, {
        before: process.argv.includes('--before'),
        screenshots: 'docs/screenshots/issue-56-question-unread-review',
      })
    )
  );
} finally {
  await browser.close();
}
