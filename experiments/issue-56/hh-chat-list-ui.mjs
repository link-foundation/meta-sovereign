import { chromium } from 'playwright';
import { verifyHhChatList } from '../../js/tests/helpers/e2e-hh-chat-list.mjs';
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyHhChatList(browser, {
        before: process.argv.includes('--before'),
        screenshots: 'docs/screenshots/issue-56-hh-chat-list',
      })
    )
  );
} finally {
  await browser.close();
}
