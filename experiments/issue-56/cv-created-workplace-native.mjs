import { chromium } from 'playwright';
import { verifyCvWatchCreatedWorkplace } from '../../js/tests/helpers/e2e-cv-created-workplace.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_EXECUTABLE_PATH || chromium.executablePath(),
});
try {
  const result = await verifyCvWatchCreatedWorkplace(browser, {
    before: process.argv.includes('--before'),
    screenshots: process.argv.includes('--screenshots')
      ? 'docs/case-studies/issue-56'
      : undefined,
  });
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
