import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { verifyVkFriends } from '../../js/tests/helpers/e2e-vk-friends.mjs';
const screenshots = 'docs/screenshots/issue-56-vk-friends';
await mkdir(screenshots, { recursive: true });
const browser = await { chromium, webkit }[
  process.env.E2E_BROWSER ?? 'webkit'
].launch({ headless: true });
try {
  console.log(
    JSON.stringify(
      await verifyVkFriends(browser, {
        before: process.argv.includes('--before'),
        screenshots,
      })
    )
  );
} finally {
  await browser.close();
}
