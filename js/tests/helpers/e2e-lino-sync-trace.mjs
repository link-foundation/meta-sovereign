/** Bounded synthetic-fixture diagnostics; no SDP, ICE addresses or records. */
export const traceSyncPeer = async (page, index) => {
  if (process.env.CI_LINO_SYNC_DEBUG !== '1') {
    return async () => {};
  }
  const events = [];
  const record = (event, fields) => {
    events.push({ event, ...fields });
    if (events.length > 24) {
      events.shift();
    }
  };
  await page.addInitScript(() => {
    globalThis.metaSovereignDebug = true;
  });
  page.on('console', (event) => {
    if (event.text().startsWith('WebRTC sync failed')) {
      record('transport-error', { message: event.text().slice(0, 500) });
    }
    if (event.text().startsWith('[ms-debug]')) {
      record('boot', { message: event.text() });
    }
  });
  page.on('pageerror', (error) =>
    console.error(
      `[sync-peer-${index}-error] ${error.name}: ${String(error.stack).slice(0, 2000)}`
    )
  );
  const trace = async (phase) => {
    const document = await page
      .evaluate(() => ({
        started: globalThis.performance.timeOrigin,
        api: Boolean(globalThis.__msApi),
        ready: globalThis.document.readyState,
        media: globalThis.__syncFixtureMedia?.active ?? false,
      }))
      .catch((error) => ({ unavailable: error.name }));
    record('document', { phase, ...document });
    console.log(`[sync-peer-${index}] ${JSON.stringify(events)}`);
  };
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      void trace('navigation');
    }
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/app.min.js') {
      record('bundle', {
        resource: response.request().resourceType(),
        status: response.status(),
        etag: response.headers().etag ?? null,
      });
    }
  });
  return trace;
};
