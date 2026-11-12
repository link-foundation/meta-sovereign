import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
});
let fixture;
try {
  fixture = await vacancyBrowserFixture(browser);
  await fixture.page.context().close();
} catch (error) {
  await browser.close();
  throw error;
}
const stats = () => ({
  opens: fixture.records.length,
  closed: fixture.records.every((record) => record.closed),
  providerClicks: fixture.records.reduce(
    (sum, record) => sum + record.clicks,
    0
  ),
  pageErrors: fixture.errors,
  liveProvider: false,
});
const control = createServer((_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: fixture.base,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await fixture.close();
    await browser.close();
    console.log(JSON.stringify(stats()));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
