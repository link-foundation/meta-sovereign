import { webkit } from 'playwright';
import { verifyRunnerSessions } from '../../js/tests/helpers/e2e-runner-sessions.mjs';

const browser = await webkit.launch({ headless: true });
try {
  console.log(
    JSON.stringify(
      await verifyRunnerSessions(browser, {
        screenshots: 'docs/screenshots',
      })
    )
  );
} finally {
  await browser.close();
}
