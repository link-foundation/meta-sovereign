import { webkit } from 'playwright';
import { traceBrowserScenario } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyApplicationSalaryBatch } from '../../js/tests/helpers/e2e-application-salary-batch.mjs';

const browser = await webkit.launch({ headless: true });
try {
  await traceBrowserScenario(
    'job-application-salary',
    'verifyApplicationSalaryBatch',
    () => verifyApplicationSalaryBatch(browser)
  );
} finally {
  await browser.close();
  console.log(JSON.stringify({ browserClosed: true, liveProvider: false }));
}
