import { chromium } from 'playwright';
import { verifyHhChatScan } from '../../js/tests/helpers/e2e-hh-chat-scan.mjs';
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyHhChatScan(browser, {
        before: process.argv.includes('--before'),
        screenshots: 'docs/screenshots/issue-56-hh-chat-scan',
      })
    )
  );
} finally {
  await browser.close();
}
