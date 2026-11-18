import { createServer } from 'node:http';
import { webkit } from 'playwright';
import { cvCreatedWorkplaceBrowserFixture } from './cv-created-workplace-browser-fixture.mjs';

const browser = await webkit.launch({
  headless: true,
  handleSIGTERM: false,
  handleSIGINT: false,
});
const fixture = await cvCreatedWorkplaceBrowserFixture(browser);
const stats = async () => ({
  ...fixture.createdCounters,
  ...fixture.counters,
  snapshots:
    (await fixture.store.get('jobs-cv-snapshots:jobs'))?.snapshots ?? [],
  errors: fixture.errors,
  authenticatedProvider: false,
});
// Controls operate only the owned, routed provider fixture. MCP owns the actual UI.
const control = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  try {
    if (req.method === 'POST' && req.url === '/save') {
      await fixture.provider
        .locator('textarea')
        .fill('Independent MCP owner-created workplace');
      await fixture.provider
        .locator('[data-qa="profile-layout-save-button"]')
        .click();
    } else if (req.method === 'POST' && req.url === '/mismatch') {
      await fixture.reset();
      fixture.mode('mismatch');
    } else if (req.method !== 'GET' || req.url !== '/') {
      res.statusCode = 404;
    }
    res.end(JSON.stringify(await stats()));
  } catch (error) {
    console.error(error);
    res.writeHead(500).end('{"error":"fixture"}');
  }
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
    console.log(JSON.stringify(await stats()));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
