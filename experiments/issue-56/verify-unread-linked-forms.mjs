import { chromium } from 'playwright';
import { verifyUnreadLinkedForms } from '../../js/tests/helpers/e2e-unread-linked-forms.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_EXECUTABLE_PATH ?? chromium.executablePath(),
});
try {
  const result = await verifyUnreadLinkedForms(browser, {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots',
  });
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
