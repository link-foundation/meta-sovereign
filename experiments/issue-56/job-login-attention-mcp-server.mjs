import { createInterface } from 'node:readline';
import { chromium } from 'playwright';
import { jobLoginBrowserFixture } from './job-login-browser-fixture.mjs';

const terminal = createInterface({ input: process.stdin });
const browser = await chromium.launch({
  executablePath: process.env.E2E_EXECUTABLE_PATH,
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
let fixture;
try {
  fixture = await jobLoginBrowserFixture(browser);
  console.log(JSON.stringify({ base: fixture.base }));
  for await (const line of terminal) {
    if (line.trim() === 'quit') {
      break;
    }
    if (line.trim() === 'close') {
      const [owner] = fixture.providerPages;
      const privateAccess = await owner.evaluate(() => globalThis.loginAccess);
      await owner.close();
      console.log(
        JSON.stringify({ privateAccess, focuses: fixture.records[0].focuses })
      );
    }
  }
} finally {
  terminal.close();
  try {
    await fixture?.close();
    if (fixture) {
      console.log(
        JSON.stringify({
          records: fixture.records.map(({ closed, clicks, focuses }) => ({
            closed,
            clicks,
            focuses,
          })),
          errors: fixture.errors,
        })
      );
    }
  } finally {
    await browser.close();
  }
}
