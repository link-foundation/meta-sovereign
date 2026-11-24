import { chromium } from 'playwright';
import { cvPrepareBrowserFixture } from './cv-prepare-browser-fixture.mjs';
import { waitForCvFixtureShutdown } from './cv-fixture-server.mjs';
import { experienceAutoKey } from '../../js/src/cv/experience-auto-record.js';

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
  const acquire = process.env.EXPERIENCE_REVIEW_MCP_ACQUISITION === '1';
  const checkpoint = process.env.EXPERIENCE_REVIEW_MCP_CHECKPOINT === '1';
  if (checkpoint || acquire) {
    process.once('SIGUSR2', async () => {
      try {
        if (acquire) {
          const preparations = await fixture.store.query(
            ({ id, requestId, phase }) =>
              id.startsWith('secret:cv-experience-auto:') &&
              phase === 'completed' &&
              id === experienceAutoKey(requestId)
          );
          if (preparations.length !== 1) {
            throw new Error('Expected one acknowledged CV preparation.');
          }
          const row = await fixture.seedReviewAcquisition(
            preparations[0].requestId
          );
          console.log(
            JSON.stringify({
              checkpoint: 'acquiring',
              requestId: row.requestId,
            })
          );
          return;
        }
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
        const row = rows[0];
        await fixture.store.put({ ...row, phase: 'selecting' });
        console.log(
          JSON.stringify({
            checkpoint: 'selecting',
            requestId: row.requestId,
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
        if (checkpoint || acquire) {
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
