// Smoke check after merging main (issue #35 greetings) into the issue #31
// branch: the SPA's Chat, Automation and Greetings tabs open without
// console errors against the seeded demo server.
//   node experiments/automations-spa-server.mjs 4799 &
//   node experiments/merged-spa-smoke.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4799/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
await page.goto(url);
for (const name of ['Chat', 'Automation', 'Greetings']) {
  await page.getByRole('button', { name, exact: true }).first().click();
  await page.waitForTimeout(500);
  const heading = await page.locator('h1, h2').first().textContent();
  console.log(`${name}: ${heading?.trim()}`);
}
console.log(
  errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors'
);
await browser.close();
process.exit(errors.length ? 1 : 0);
