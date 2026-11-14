// Optional metadata for a disclosure failure whose hosted cause is unproven.
// Keep owner fields and URL/query values out of diagnostic output.
export const profileNavigationTrace = (page) => {
  if (process.env.CI_PROFILE_NAVIGATION_DEBUG !== '1') {
    return async () => {};
  }
  return async (phase, observation = {}) => {
    const state = await page
      .evaluate(() => {
        const root = document.querySelector('[data-question-controls]');
        const summary = root?.querySelector(':scope > summary');
        return {
          document: globalThis.performance.timeOrigin,
          ready: document.readyState,
          automation: globalThis.location.hash === '#/automation',
          root: root
            ? {
                open: root.open,
                attribute: root.hasAttribute('open'),
                connected: root.isConnected,
                summaryVisible: Boolean(summary?.getClientRects().length),
              }
            : null,
          details: globalThis.browserDetailsTrace?.slice(-12),
        };
      })
      .catch(() => ({ unavailable: true }));
    console.log(
      '[profile-navigation]',
      JSON.stringify({ phase, ...observation, ...state })
    );
  };
};
