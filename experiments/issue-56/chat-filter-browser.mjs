import { chromium } from 'playwright';
import { verifyHhChatFilter } from '../../js/tests/helpers/e2e-hh-chat-filter.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyHhChatFilter(browser, {
        before: process.argv.includes('--before'),
        screenshots: 'docs/screenshots/issue-56-chat-filter',
      })
    )
  );
} finally {
  await browser.close();
}
