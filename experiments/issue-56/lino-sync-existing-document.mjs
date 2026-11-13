import assert from 'node:assert/strict';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { stepTwoBrowserWebRtcConvergence } from '../../js/tests/helpers/e2e-browser-spa-sync.mjs';

// Reproduce only the final SPA sync step after the owner page already reached
// Chat (the preceding skip-link step). Keep the real app, native storage, negotiated signaling and RTC.
const { page, base, finish } = await openChatApp('sync-existing-document', {
  store: createMemoryStore(),
  serverOptions: { enableSync: true },
});
await finish(async () => {
  await page.goto(`${base}/#chat`);
  await page.waitForFunction(() => Boolean(globalThis.__msApi));
  const previous = await page.evaluate(() => globalThis.performance.timeOrigin);
  await stepTwoBrowserWebRtcConvergence({
    browser: page.context().browser(),
    page,
    base,
  });
  assert.notEqual(
    await page.evaluate(() => globalThis.performance.timeOrigin),
    previous
  );
});
