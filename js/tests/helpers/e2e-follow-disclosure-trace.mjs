// Default-off native-event metadata for the unresolved hosted disclosure failure.
export const followDisclosureTrace = async (page, panel = 'chats') => {
  if (process.env.CI_FOLLOW_DISCLOSURE_DEBUG !== '1') {
    return async () => {};
  }
  const selector = {
    chats: '[data-follow-chats-panel]',
    backlinks: '[data-follow-backlinks]',
  }[panel];
  if (!selector) {
    throw new Error('Unknown Follow disclosure diagnostic');
  }
  await page.addInitScript(
    ({ selector }) => {
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
      const records = [];
      const snapshot = () => {
        const root = document.querySelector(selector);
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
          root: identity(root),
          summary: identity(summary),
          open: root?.open,
          connected: root?.isConnected,
          summaryRect: rect?.toJSON(),
          summaryHit: Boolean(summary?.contains(hit)),
        };
      };
      globalThis.followDisclosureSnapshot = () => ({
        ...snapshot(),
        events: records,
      });
      const record = (event) => {
        const root = document.querySelector(selector);
        const summary = event.target?.closest?.('summary');
        const target = event.target?.closest?.('details');
        if (event.type === 'toggle' && !target?.matches(selector)) {
          return;
        }
        records.push({
          ...snapshot(),
          at: Math.round(globalThis.performance.now()),
          type: event.type,
          phase: event.eventPhase,
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
          target: identity(target),
          targetTag: event.target?.tagName,
          onSummary: Boolean(summary),
          inside: Boolean(root?.contains(event.target)),
          targetOpen: target?.open,
          x: Number.isFinite(event.clientX) ? event.clientX : undefined,
          y: Number.isFinite(event.clientY) ? event.clientY : undefined,
        });
        if (records.length > 64) {
          records.shift();
        }
      };
      for (const type of ['pointerdown', 'pointerup', 'click', 'toggle']) {
        globalThis.addEventListener(type, record, {
          capture: true,
          passive: true,
        });
      }
      globalThis.addEventListener('click', record, { passive: true });
    },
    { selector }
  );
  return async (phase) => {
    const state = await page
      .evaluate(
        () => globalThis.followDisclosureSnapshot?.() ?? { unavailable: true }
      )
      .catch(() => ({ unavailable: true }));
    console.log(
      '[follow-disclosure]',
      JSON.stringify({ panel, phase, ...state })
    );
  };
};
