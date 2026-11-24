import { waitForBrowserValue } from './e2e-browser-value.mjs';
import { prepareSyncPeer, stopSyncPeer } from './e2e-sync-peer.mjs';

// Boot a *second* SPA in a fresh browser context (so it gets an
// isolated IndexedDB) on the same backend, mutate in page A, observe
// the same link materialise in page B's local store. Convergence has
// to happen via the WebRTC data channel — the SPA's writes are local-
// only (api.put → store.put), so page B can only see the link if
// `attachWebRtcSync` wired the store to a peer transport that
// delivered the event.
export const stepTwoBrowserWebRtcConvergence = async ({
  browser,
  page,
  base,
}) => {
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  try {
    // Use the same real signaling readiness and isolated mock capture fixture
    // as the dedicated sync regression, including any discovery reload.
    const engine = browser.browserType().name();
    await prepareSyncPeer(page, base, engine);
    await prepareSyncPeer(pageB, base, engine);

    // Page A writes a unique link via the SPA's own put path so it
    // flows store → peer.onLocal → transport.send.
    const probeId = `msg:rtc-probe-${Date.now()}`;
    await page.evaluate(async (id) => {
      await window.__msApi.put({
        id,
        tokens: ['rtc', 'probe'],
        body: 'two-browser convergence',
      });
    }, probeId);

    // Page B should observe the link in its local store. Poll for up
    // to 20s — ICE negotiation + datagram handshake is not free in a
    // headless browser.
    await waitForBrowserValue(
      pageB,
      async (id) => {
        const link = await window.__msApi.get(id);
        return Boolean(link && link.id === id);
      },
      probeId,
      { timeoutMs: 20000, pollingMs: 250 }
    );
  } finally {
    await stopSyncPeer(page);
    await stopSyncPeer(pageB);
    await contextB.close();
  }
};
