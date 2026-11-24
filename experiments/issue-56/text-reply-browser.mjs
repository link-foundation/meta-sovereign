import { chromium } from 'playwright';
import { verifyTextReplies } from '../../js/tests/helpers/e2e-text-reply.mjs';
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyTextReplies(browser, {
        before: process.argv.includes('--before'),
        part: process.argv.includes('--reservations') ? 'reservations' : 'all',
        screenshots: 'docs/screenshots/issue-56-text-reply',
      })
    )
  );
} finally {
  await browser.close();
}
