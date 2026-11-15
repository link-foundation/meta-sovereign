// Install before the document's first Playwright predicate captures RAF.
// This controls inactive-tab scheduling only; RTC, saves and timers stay native.
export const installSyncFrameGate = (page) =>
  page.addInitScript(() => {
    const frame = globalThis.requestAnimationFrame.bind(globalThis);
    globalThis.requestAnimationFrame = (callback) =>
      globalThis.__pauseIsolationFrames ? 0 : frame(callback);
  });

export const withPausedSyncFrames = async (page, check) => {
  await page.evaluate(() => {
    const put = globalThis.__msApi.put;
    globalThis.__restoreIsolationFrame = () => {
      globalThis.__pauseIsolationFrames = false;
      globalThis.__msApi.put = put;
    };
    globalThis.__pauseIsolationFrames = true;
    globalThis.__msApi.put = async (link) => {
      const result = await put(link);
      if (link.id === 'l:receive-isolation-owner') {
        // Keep the predicate initially false. Effects already use the native
        // store; only this fixture's completion flag waits a finite 250 ms.
        await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
      }
      return result;
    };
  });
  try {
    return await check();
  } finally {
    await page.evaluate(() => {
      globalThis.__restoreIsolationFrame();
      delete globalThis.__restoreIsolationFrame;
    });
  }
};
