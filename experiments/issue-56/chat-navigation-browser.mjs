import { chromium } from 'playwright';
import {
  verifyChatNavigation,
  verifyUnreadViewGuards,
  verifyUnreadNavigationStop,
} from '../../js/tests/helpers/e2e-chat-navigation.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await (
        process.argv.includes('--stop')
          ? verifyUnreadNavigationStop
          : process.argv.includes('--guards')
            ? verifyUnreadViewGuards
            : verifyChatNavigation
      )(browser, {
        before: process.argv.includes('--before'),
        screenshots: 'docs/screenshots/issue-56-chat-navigation',
      })
    )
  );
} finally {
  await browser.close();
}
