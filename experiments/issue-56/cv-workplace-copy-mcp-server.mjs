import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { cvWorkplacePrepareBrowserFixture } from './cv-workplace-prepare-browser-fixture.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_EXECUTABLE_PATH,
  handleSIGTERM: false,
  handleSIGINT: false,
});
const fixture = await cvWorkplacePrepareBrowserFixture(browser, {
  fieldsMode: true,
  copyMode: true,
});
const { identity } = fixture.data.sources.find(
  (row) => row.identity.language === 'en'
);
await fixture.open({ screen: 'overview', shared: true });
const control = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/native') {
      await fixture.provider.locator('input[name="position"]').waitFor();
      const image = await fixture.provider.screenshot({ fullPage: true });
      res.writeHead(200, { 'content-type': 'image/png' }).end(image);
      return;
    }
    res.setHeader('content-type', 'application/json');
    if (req.method !== 'GET' || req.url !== '/') {
      res.writeHead(404).end('{}');
      return;
    }
    res.end(
      JSON.stringify({
        source: `${identity.exportId}:${identity.hash}`,
        ...fixture.counters,
        errors: fixture.errors,
        authenticatedProvider: false,
      })
    );
  } catch (error) {
    console.error(error.message);
    res.writeHead(500).end('{}');
  }
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: fixture.base,
    control: `http://127.0.0.1:${control.address().port}`,
    source: `${identity.exportId}:${identity.hash}`,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await fixture.close();
    await browser.close();
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
