import { createServer } from 'node:http';
import { webkit } from 'playwright';
import { cvWorkplaceBrowserFixture } from './cv-workplace-browser-fixture.mjs';

// Only the explicitly owned, routed provider fixture receives these actions.
// The independent MCP browser operates the real UI/server over Lino.
const browser = await webkit.launch({
  headless: true,
  handleSIGTERM: false,
  handleSIGINT: false,
});
const fixture = await cvWorkplaceBrowserFixture(browser);
const stats = async () => ({
  ...fixture.counts(),
  ...fixture.counters,
  snapshots:
    (await fixture.store.get('jobs-cv-snapshots:jobs'))?.snapshots ?? [],
  errors: fixture.errors,
  nativeProviderFixture: true,
  authenticatedProvider: false,
});
const control = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  try {
    const mode = req.url?.match(
      /^\/edit\/(valid|metadata|membership|challenge)$/u
    )?.[1];
    if (req.method === 'POST' && mode) {
      Object.assign(fixture.modes, {
        mismatch: mode === 'metadata',
        membershipMismatch: mode === 'membership',
        challenge: mode === 'challenge',
      });
      await fixture.provider.goto(fixture.url);
      await fixture.provider
        .locator('textarea')
        .fill(`Independent MCP owner revision ${mode}`);
    } else if (req.method === 'POST' && req.url === '/save') {
      await fixture.provider
        .locator('[data-qa="profile-layout-save-button"]')
        .click();
    } else if (req.method !== 'GET' || req.url !== '/') {
      res.statusCode = 404;
    }
    res.end(JSON.stringify(await stats()));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end('{"error":"fixture"}');
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
