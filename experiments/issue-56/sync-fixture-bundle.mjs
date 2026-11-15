import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { stepTwoBrowserWebRtcConvergence } from '../../js/tests/helpers/e2e-browser-spa-sync.mjs';

// The exact shell-sync scenario, with two owned contexts and real signaling,
// native mock capture, persistence and RTC. No other shell scenarios run.
const { page, base, finish, engine } = await openChatApp(
  'sync-fixture-bundle',
  { store: createMemoryStore(), serverOptions: { enableSync: true } }
);
await finish(async () => {
  await stepTwoBrowserWebRtcConvergence({
    browser: page.context().browser(),
    page,
    base,
  });
  console.log(
    '[sync-fixture-bundle]',
    JSON.stringify({
      engine,
      contexts: 2,
      convergence: true,
      liveProvider: false,
      mockCapture: await page.evaluate(() =>
        globalThis.__syncFixtureMedia
          ?.getTracks()
          .every((track) => track.readyState === 'ended')
      ),
    })
  );
});
