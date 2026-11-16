import { webkit } from 'playwright';
import assert from 'node:assert/strict';
import { verifyVkCache } from '../../js/tests/helpers/e2e-vk-cache.mjs';
import { LINO_TEXT, encodeWire } from '../../js/src/transport/lino.js';

// One finite synthetic case. Trace only this fixture's cache requests and
// the displayed fields; never run against an authenticated provider.
const browser = await webkit.launch({ headless: true });
const openContext = browser.newContext.bind(browser);
const refuseReload = process.argv.includes('--refuse-reload');
browser.newContext = async (...args) => {
  const context = await openContext(...args);
  if (refuseReload) {
    let inspections = 0;
    await context.route('**/api/vk/cache/inspect', async (route) => {
      if (++inspections !== 2) {
        return route.continue();
      }
      return route.fulfill({
        status: 400,
        contentType: LINO_TEXT,
        body: encodeWire({ ok: false, code: 'bad-request' }, LINO_TEXT),
      });
    });
  }
  context.on('page', (page) => {
    page.on('request', (request) => {
      if (request.url().includes('/api/vk/cache/')) {
        console.log(
          JSON.stringify({
            request: new URL(request.url()).pathname,
            input: request.postData(),
          })
        );
      }
    });
    page.on('response', async (response) => {
      if (response.url().includes('/api/vk/cache/')) {
        const raw = await response.text().catch(() => '<closed>');
        console.log(
          JSON.stringify({
            response: new URL(response.url()).pathname,
            status: response.status(),
            // Cache payloads contain hundreds of synthetic messages. A refusal
            // is small; successful responses need only their leading summary.
            body: raw.slice(0, 600),
          })
        );
      }
    });
  });
  return context;
};
try {
  const run = () =>
    verifyVkCache(browser, {
      screenshots: 'ci-logs/vk-cache-reload-screenshots',
    });
  if (refuseReload) {
    await assert.rejects(run, (error) => {
      assert.match(error.message, /VK cache fixture action refused/u);
      assert.match(error.message, /"status":400/u);
      assert.match(error.message, /"code":"bad-request"/u);
      assert.match(error.message, /accountId/u);
      console.log(JSON.stringify({ expectedRefusal: error.message }));
      return true;
    });
  } else {
    console.log(JSON.stringify({ result: await run() }));
  }
} finally {
  await browser.close();
}
