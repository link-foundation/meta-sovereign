import { chromium } from 'playwright';
import { verifyBrowserHistoryArchive } from '../../js/tests/helpers/e2e-browser-history-archive.mjs';

const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
try {
  console.log(JSON.stringify(await verifyBrowserHistoryArchive(browser)));
} finally {
  await browser.close();
}
