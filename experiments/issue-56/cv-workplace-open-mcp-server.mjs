import { chromium } from 'playwright';
import { cvWorkplacePrepareBrowserFixture } from './cv-workplace-prepare-browser-fixture.mjs';

// Owned synthetic native provider and separate UI server; no account or user tab.
const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/google-chrome',
});
let fixture;
try {
  fixture = await cvWorkplacePrepareBrowserFixture(browser);
  await fixture.open({ screen: 'overview', delay: 350 });
  console.log(JSON.stringify({ base: fixture.base }));
  await new Promise((resolve) => process.stdin.once('data', resolve));
  process.stdin.pause();
  console.log(
    JSON.stringify({
      ...fixture.counters,
      clicks: await fixture.provider.evaluate(
        () => globalThis.sessionStorage.fixtureListClicks
      ),
      providerSaves: await fixture.provider.evaluate(
        () => globalThis.fixtureSaves
      ),
      providerCancels: await fixture.provider.evaluate(
        () => globalThis.fixtureCancels
      ),
    })
  );
} finally {
  await fixture?.close();
  await browser.close();
  console.log(JSON.stringify({ closed: true }));
}
