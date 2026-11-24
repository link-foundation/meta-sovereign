import { chromium } from 'playwright';
import { cvPrepareBrowserFixture } from './cv-prepare-browser-fixture.mjs';
import { waitForCvFixtureShutdown } from './cv-fixture-server.mjs';

const browser = await chromium.launch({
  headless: true,
  handleSIGINT: false,
  handleSIGTERM: false,
  executablePath: process.env.E2E_EXECUTABLE_PATH || undefined,
});
let fixture;
try {
  fixture = await cvPrepareBrowserFixture(browser, { reviewQueue: true });
  console.log(JSON.stringify({ input: fixture.queue.input }));
  if (process.env.EXPERIENCE_REVIEW_MCP_CHECKPOINT === '1') {
    process.once('SIGUSR2', async () => {
      try {
        const rows = await fixture.store.query(
          ({ id, phase }) =>
            id.startsWith('secret:cv-experience-review:') &&
            phase === 'completed'
        );
        if (
          rows.length !== 1 ||
          rows[0].pending.length ||
          rows[0].current !== null
        ) {
          throw new Error(
            'Expected one acknowledged queue with no pending editor.'
          );
        }
        await fixture.store.put({ ...rows[0], phase: 'selecting' });
        console.log(
          JSON.stringify({
            checkpoint: 'selecting',
            requestId: rows[0].requestId,
          })
        );
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      }
    });
  }
  await waitForCvFixtureShutdown({
    base: fixture.base,
    async close() {
      let provider;
      try {
        if (process.env.EXPERIENCE_REVIEW_MCP_CHECKPOINT === '1') {
          provider = await fixture.provider.evaluate(() => ({
            editors: globalThis.fixtureOpeners,
            saves: globalThis.fixtureSaves,
            cancels: globalThis.fixtureCancels,
          }));
        }
      } finally {
        await fixture.close();
      }
      if (provider) {
        console.log(
          JSON.stringify({
            provider,
            ...fixture.counters,
            resourcesClosed: true,
            liveProvider: false,
          })
        );
      }
    },
  });
  fixture = null;
} finally {
  try {
    await fixture?.close();
  } finally {
    await browser.close();
  }
}
