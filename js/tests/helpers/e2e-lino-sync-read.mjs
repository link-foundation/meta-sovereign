/** A reload has no API until boot finishes; absence is not a deleted record. */
export const readSyncPeer = async (page, id) => {
  try {
    return await page.evaluate(async (key) => {
      const api = globalThis.__msApi;
      if (typeof api?.get !== 'function') {
        return null;
      }
      return {
        record: await api.get(key),
        secret: await api.get('secret:rtc-fixture'),
      };
    }, id);
  } catch (error) {
    // Playwright may lose its execution context between lookup and evaluation.
    if (
      /Execution context was destroyed|Cannot find context with specified id/u.test(
        error.message
      )
    ) {
      return null;
    }
    throw error;
  }
};

/** Reproduce a peer whose initial discovery failed, as in the hosted trace. */
export const holdSyncDiscovery = async (page) => {
  const refuse = (route) => route.abort('connectionrefused');
  await page.route('**/api/status?probe=1', refuse);
  return () => page.unroute('**/api/status?probe=1', refuse);
};

/** Exercise real offline rediscovery; never replace the app API or sockets. */
export const reloadSyncPeer = async (page, releaseDiscovery) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const timer = setTimeout(release, 5000);
  try {
    await page.route(
      '**/app.min.js',
      async (route) => {
        await gate;
        await route.fallback();
      },
      { times: 1 }
    );
    const navigation = page.waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
    });
    await releaseDiscovery();
    await page.evaluate(() =>
      globalThis.dispatchEvent(new globalThis.Event('online'))
    );
    await navigation;
    await page.waitForFunction(() => !globalThis.__msApi);
    console.log('[sync-reload] new document has no API before bundle boot');
    clearTimeout(timer);
    setTimeout(release, 500);
  } catch (error) {
    clearTimeout(timer);
    release();
    throw error;
  }
};
