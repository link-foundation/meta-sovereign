import { chromium } from 'playwright';
import { verifyUnreadNoticeControls } from '../../js/tests/helpers/e2e-unread-notice-controls.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyUnreadNoticeControls(browser, {
        before: process.argv.includes('--before'),
        screenshots: 'docs/screenshots/issue-56-unread-notices',
      })
    )
  );
} finally {
  await browser.close();
}
