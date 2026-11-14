import { chromium } from 'playwright';
import { verifyUnreadDeliveryVisit } from '../../js/tests/helpers/e2e-unread-delivery-visit.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(
    JSON.stringify(
      await verifyUnreadDeliveryVisit(browser, {
        before: process.argv.includes('--before'),
      })
    )
  );
} finally {
  await browser.close();
}
