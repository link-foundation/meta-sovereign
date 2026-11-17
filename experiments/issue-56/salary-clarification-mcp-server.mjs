import { chromium } from 'playwright';
import { questionBrowserServer } from './question-browser-server.mjs';
import { salaryClarification } from './salary-clarification-fixture.mjs';

const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
const fixture = await questionBrowserServer(browser);
try {
  await fixture.reset({ freeText: true, question: salaryClarification });
  console.log(JSON.stringify({ base: fixture.base, liveProvider: false }));
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once('data', resolve));
} finally {
  process.stdin.pause();
  const stats = await fixture.stats();
  await fixture.close();
  await browser.close();
  console.log(
    JSON.stringify({ stats, resourcesClosed: true, liveProvider: false })
  );
}
