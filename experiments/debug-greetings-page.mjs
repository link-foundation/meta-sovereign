// Debug helper for issue #35: open the SPA served by startServer and dump
// what the page shows, console messages and failed requests.
import { chromium } from 'playwright';
import { createMemoryStore } from '../js/src/storage/index.js';
import { startServer } from '../js/src/server/index.js';

const handle = await startServer({
  port: 0,
  store: createMemoryStore(),
  enableHandlers: false,
  enableSync: false,
});
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('console', m.type(), m.text()));
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('requestfailed', (r) =>
  console.log('failed', r.url(), r.failure()?.errorText)
);
page.on('response', (r) => console.log('resp', r.status(), r.url()));
await page.goto(`http://127.0.0.1:${handle.port}`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
console.log((await page.content()).slice(0, 1500));
console.log(
  await page.$$eval('button[data-view]', (bs) => bs.map((b) => b.dataset.view))
);
await browser.close();
await handle.close();
