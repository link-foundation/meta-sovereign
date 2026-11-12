// Run only the SPA's real two-browser convergence step, never the full suite.
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { stepTwoBrowserWebRtcConvergence } from '../../js/tests/helpers/e2e-browser-spa-sync.mjs';

const fixture = await openChatApp('lino-sync-spa-readiness', {
  store: createMemoryStore(),
  serverOptions: { enableSync: true },
});
await fixture.finish(() =>
  stepTwoBrowserWebRtcConvergence({
    browser: fixture.page.context().browser(),
    page: fixture.page,
    base: fixture.base,
  })
);
