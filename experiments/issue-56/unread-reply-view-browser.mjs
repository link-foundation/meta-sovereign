import { chromium } from 'playwright';
import { verifyUnreadReplyView } from '../../js/tests/helpers/e2e-unread-reply-view.mjs';
import { verifyUnreadReplyViewControls } from '../../js/tests/helpers/e2e-unread-reply-view-controls.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  const options = {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-unread-reply-view',
  };
  const native = process.argv.includes('--controls-only')
    ? undefined
    : await verifyUnreadReplyView(browser, options);
  if (native) {
    console.log(JSON.stringify({ native }));
  }
  const controls =
    !options.before && !process.argv.includes('--native-only')
      ? await verifyUnreadReplyViewControls(browser, options)
      : undefined;
  console.log(JSON.stringify({ native, controls }));
} finally {
  await browser.close();
}
