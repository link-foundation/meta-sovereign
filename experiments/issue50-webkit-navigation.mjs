// Distinguish same-document navigation from a browser reload in tutorial traces.
import assert from 'node:assert/strict';
import http from 'node:http';
import { webkit } from 'playwright';

const server = http.createServer((req, res) =>
  res.end('<main>Navigation probe</main>')
);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await webkit.launch();
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    globalThis.initialDocument = Math.random();
    globalThis.initTime = globalThis.performance.timeOrigin;
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const before = await page.evaluate(() => [
    globalThis.initialDocument,
    globalThis.initTime,
  ]);
  await page.evaluate(() => globalThis.history.pushState({}, '', '#/contacts'));
  const after = await page.evaluate(() => [
    globalThis.initialDocument,
    globalThis.initTime,
  ]);
  console.log({ before, after });
  assert.deepEqual(
    after,
    before,
    'same-document navigation preserves the execution context'
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
