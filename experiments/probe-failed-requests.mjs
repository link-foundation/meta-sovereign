// PR #34 review: the UI audit logged ERR_HTTP2_PROTOCOL_ERROR now and
// then. List every request that leaves localhost or fails while the
// SPA visits each view: the Greetings catalog loads sticker previews
// from vk.com, whose fetches sometimes fail from this sandbox.
//
//   node experiments/probe-failed-requests.mjs [url]
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
page.on('requestfailed', (r) =>
  console.log('FAILED', r.failure()?.errorText, r.url())
);
page.on(
  'request',
  (r) =>
    !r.url().startsWith('http://localhost') && console.log('EXTERNAL', r.url())
);
await page.goto(process.argv[2] ?? 'http://localhost:4799/', {
  waitUntil: 'networkidle',
});
for (const v of [
  'chat',
  'operator',
  'contacts',
  'automation',
  'patterns',
  'replies',
  'facts',
  'audience',
  'broadcast',
  'outreach',
  'profile',
  'backup',
  'status',
  'connections',
  'cv',
  'greetings',
  'settings',
]) {
  await page.locator(`[data-view="${v}"].nav-item`).first().click();
  await page.waitForTimeout(500);
}
await browser.close();
