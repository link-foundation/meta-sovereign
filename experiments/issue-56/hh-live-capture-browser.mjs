import { chromium } from 'playwright';
import { verifyHhLiveCapture } from '../../js/tests/helpers/e2e-hh-live-capture.mjs';

const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  const result = await verifyHhLiveCapture(browser, {
    collectFailures: process.env.HH_CAPTURE_BEFORE === '1',
  });
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
