// Issue #31 / PR #34: a desktop shot of Contacts to check how a named
// contact (name, then its id) lines up in the table.
//   node ../experiments/contacts-named-shot.mjs http://localhost:4799/ out.png
import { chromium } from 'playwright';

const [url = 'http://localhost:4799/', out = '/tmp/contacts.png'] =
  process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.locator('[data-view="contacts"].nav-item').first().click();
await page.waitForSelector('table.stack-table tbody tr');
await page.screenshot({ path: out });
for (const row of await page.locator('tbody tr').all()) {
  console.log((await row.innerText()).replace(/\s+/g, ' '));
}
await browser.close();
