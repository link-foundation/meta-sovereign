import { createServer } from 'node:http';
import { setImmediate } from 'node:timers';
import { chromium } from 'playwright';
import { vacancyMetadataFixture } from './vacancy-metadata-fixture.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
});
let fixture;
try {
  fixture = await vacancyMetadataFixture(browser);
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
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await fixture.close();
    await browser.close();
    console.log(JSON.stringify({ ...stats(), resourcesClosed: true }));
  })());
const control = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method === 'POST' && req.url === '/close') {
    res.end(JSON.stringify(stats()));
    setImmediate(close);
    return;
  }
  if (
    req.method === 'POST' &&
    ['/net', '/conflict', '/duplicate'].includes(req.url)
  ) {
    fixture.metadataMode(req.url.slice(1));
  }
  res.end(JSON.stringify(stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    base: fixture.base,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
process.once('SIGINT', close);
process.once('SIGTERM', close);
