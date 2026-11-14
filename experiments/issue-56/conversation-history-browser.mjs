import { chromium } from 'playwright';
import { verifyConversationHistory } from '../../js/tests/helpers/e2e-conversation-history.mjs';
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyConversationHistory(browser, {
        before: process.argv.includes('--before'),
        screenshots: 'docs/screenshots/issue-56-conversation-history',
      })
    )
  );
} finally {
  await browser.close();
}
