// Default-off native-event metadata for the unresolved hosted disclosure failure.
export const followDisclosureTrace = async (page) => {
  if (process.env.CI_FOLLOW_DISCLOSURE_DEBUG !== '1') {
    return async () => {};
  }
  await page.addInitScript(() => {
    const selector = '[data-follow-chats-panel]';
    const nodes = new WeakMap();
    let serial = 0;
    const identity = (node) => {
      if (!node) {
        return null;
      }
      if (!nodes.has(node)) {
        nodes.set(node, ++serial);
      }
      return nodes.get(node);
    };
    const records = (globalThis.followDisclosureEvents = []);
    const record = (event) => {
      const root = document.querySelector(selector);
      const summary = event.target?.closest?.('summary');
      const target = event.target?.closest?.('details');
      if (!summary && !(event.type === 'toggle' && target?.matches(selector))) {
        return;
      }
      records.push({
        type: event.type,
        trusted: event.isTrusted,
        root: identity(root),
        target: identity(target),
        inside: Boolean(root?.contains(event.target)),
        open: root?.open,
        targetOpen: target?.open,
        connected: root?.isConnected,
        ready: document.readyState,
      });
      if (records.length > 40) {
        records.shift();
      }
    };
    for (const type of ['pointerdown', 'pointerup', 'click', 'toggle']) {
      globalThis.addEventListener(type, record, true);
    }
  });
  return async (phase) => {
    const state = await page
      .evaluate(() => {
        const root = document.querySelector('[data-follow-chats-panel]');
        const summary = root?.querySelector(':scope > summary');
        const rect = summary?.getBoundingClientRect();
        const hit = rect
          ? document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2
            )
          : null;
        return {
          document: globalThis.performance.timeOrigin,
          ready: document.readyState,
          automation: globalThis.location.hash === '#/automation',
          open: root?.open,
          connected: root?.isConnected,
          summaryRect: rect?.toJSON(),
          summaryHit: Boolean(summary?.contains(hit)),
          events: globalThis.followDisclosureEvents,
        };
      })
      .catch(() => ({ unavailable: true }));
    console.log('[follow-disclosure]', JSON.stringify({ phase, ...state }));
  };
};
