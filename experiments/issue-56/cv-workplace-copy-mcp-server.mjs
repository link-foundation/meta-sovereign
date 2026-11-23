import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { cvWorkplacePrepareBrowserFixture } from './cv-workplace-prepare-browser-fixture.mjs';

const followupMode = process.argv.includes('--followup');
const stale = process.argv.includes('--stale');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_EXECUTABLE_PATH,
  handleSIGTERM: false,
  handleSIGINT: false,
});
const fixture = await cvWorkplacePrepareBrowserFixture(browser, {
  fieldsMode: true,
  copyMode: true,
  followupMode,
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
    if (followupMode && req.method === 'POST') {
      if (req.url === '/open-original' && fixture.counters.saves === 1) {
        await fixture.open({ context: true });
      } else if (req.url === '/owner-save' && fixture.counters.saves < 2) {
        if (stale && fixture.counters.saves === 1) {
          fixture.followup.keepOriginalInExport();
        }
        await fixture.provider
          .locator('[data-qa="profile-layout-save-button"]')
          .click();
      } else {
        res.writeHead(409).end('{}');
        return;
      }
      res.end('{}');
      return;
    }
    if (req.method !== 'GET' || req.url !== '/') {
      res.writeHead(404).end('{}');
      return;
    }
    const cvSnapshots = followupMode
      ? ((await fixture.store.get('jobs-cv-snapshots:jobs'))?.snapshots ?? [])
      : [];
    res.end(
      JSON.stringify({
        source: `${identity.exportId}:${identity.hash}`,
        ...fixture.counters,
        errors: fixture.errors,
        ...(followupMode && {
          snapshots: cvSnapshots.map(({ hash, attemptId, workplace, cv }) => ({
            hash,
            attemptId,
            workplace,
            jobs: cv.jobs.length,
          })),
        }),
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
