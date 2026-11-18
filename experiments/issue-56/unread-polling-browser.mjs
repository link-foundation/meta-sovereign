import { chromium } from 'playwright';
import { verifyUnreadPollingControls } from '../../js/tests/helpers/e2e-unread-polling-controls.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyUnreadPollingControls(browser, {
        before: process.argv.includes('--before'),
        screenshots: 'docs/screenshots/issue-56-unread-polling',
      })
    )
  );
} finally {
  await browser.close();
}
