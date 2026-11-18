/* global document, window, setTimeout, clearTimeout */
import { randomUUID } from 'node:crypto';

/** Focus is latched: leaving again cannot silently resume an interrupted task. */
export const browserInactiveView = ({ operation, token }) => {
  const key = Symbol.for('meta-sovereign.browser-inactive-view.v1');
  const current = (state) =>
    state.interrupted || document.hasFocus() ? 'owner-active' : 'ready';
  if (operation === 'open' && !window[key]) {
    if (document.hasFocus()) {
      return { state: 'owner-active' };
    }
    const state = { token, interrupted: false };
    state.interrupt = () => {
      state.interrupted = true;
      state.notify?.();
    };
    state.events = [
      'pointerdown',
      'keydown',
      'wheel',
      'touchstart',
      'touchmove',
      'input',
    ];
    state.mark = (event) => {
      if (
        (!event.isTrusted && event === state.ownedInput) ||
        (state.ownedFilterControl &&
          event.type === 'input' &&
          event.target === state.ownedFilterControl)
      ) {
        return;
      }
      if (event.isTrusted || event.type === 'input') {
        state.interrupt();
      }
    };
    state.focus = () => {
      if (document.hasFocus()) {
        state.interrupt();
      }
    };
    for (const type of state.events) {
      document.addEventListener(type, state.mark, {
        capture: true,
        passive: true,
      });
    }
    window.addEventListener('focus', state.focus, true);
    document.addEventListener('visibilitychange', state.focus, true);
    window[key] = state;
  }
  const state = window[key];
  if (!state || state.token !== token) {
    return { state: state ? 'busy' : 'unavailable' };
  }
  const status = current(state);
  if (operation === 'release') {
    state.releaseRelay?.();
    for (const type of state.events) {
      document.removeEventListener(type, state.mark, true);
    }
    window.removeEventListener('focus', state.focus, true);
    document.removeEventListener('visibilitychange', state.focus, true);
    delete window[key];
  }
  return { state: status };
};

/** Relay outer activity to an embedded control's final page-local guard. */
export const linkBrowserInactiveOwner = async ({ token }) => {
  const state = window[Symbol.for('meta-sovereign.browser-inactive-view.v1')];
  if (!state || state.token !== token) {
    return false;
  }
  if (state.releaseRelay) {
    return state.relayReady;
  }
  const owner = window.top === window;
  const peers = new Set();
  const type = 'meta-sovereign.browser-inactive-owner.v1';
  const send = (peer, operation) => {
    try {
      peer.postMessage({ type, token, operation }, '*');
    } catch {
      state.interrupted = true;
    }
  };
  let complete;
  let timer;
  const ready = owner
    ? Promise.resolve(true)
    : new Promise((resolve) => {
        complete = resolve;
        timer = setTimeout(() => resolve(false), 1000);
      });
  state.relayReady = ready;
  const ownerStatus = () =>
    state.interrupted || document.hasFocus() ? 'owner-active' : 'ready';
  const receive = (event) => {
    const data = event.data;
    if (data?.type !== type || data.token !== token || !event.source) {
      return;
    }
    if (owner && event.source !== window && data.operation === 'observe') {
      if (peers.size >= 64 && !peers.has(event.source)) {
        return;
      }
      peers.add(event.source);
      send(event.source, ownerStatus());
    } else if (!owner && event.source === window.top) {
      if (data.operation === 'owner-active') {
        state.interrupt();
        complete(false);
      } else if (data.operation === 'ready') {
        complete(true);
      }
    }
  };
  state.notify = () => {
    for (const peer of peers) {
      send(peer, 'owner-active');
    }
  };
  state.releaseRelay = () => {
    window.removeEventListener('message', receive, true);
    clearTimeout(timer);
    complete?.(false);
    peers.clear();
    delete state.notify;
  };
  window.addEventListener('message', receive, true);
  if (!owner) {
    send(window.top, 'observe');
  }
  const linked = await ready;
  clearTimeout(timer);
  return linked;
};

const failure = (state) => {
  if (process.env.MS_BROWSER_HISTORY_DEBUG === '1') {
    console.error('[browser-inactive-view]', { state });
  }
  return Object.assign(
    new Error('The inactive provider view is no longer owned.'),
    {
      code: `browser-background-${state}`,
      historyReason: state === 'owner-active' ? state : 'document-changed',
      fallback: false,
    }
  );
};

/** Playwright otherwise forces hasFocus() true even in background Chrome tabs. */
export const prepareBrowserInactiveView = async (page) => {
  const context = page.context();
  if (context.browser()?.browserType().name() !== 'chromium') {
    throw failure('focus-unavailable');
  }
  let session;
  try {
    session = await context.newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
  } catch {
    throw failure('focus-unavailable');
  } finally {
    await session?.detach().catch(() => {});
  }
};

/** Inspect only an existing owned view, including its trusted outer document. */
export const withInactiveBrowserView = async (
  document,
  read,
  { relayOwner = false } = {}
) => {
  if (
    ['evaluateOwner', 'evaluate'].some(
      (method) => typeof document?.[method] !== 'function'
    )
  ) {
    throw failure('unavailable');
  }
  const token = randomUUID();
  const control = async (operation) => {
    for (const method of ['evaluateOwner', 'evaluate']) {
      const result = await document[method]({
        fn: browserInactiveView,
        args: [{ operation, token }],
      });
      if (result.state !== 'ready') {
        throw failure(result.state);
      }
    }
  };
  try {
    await document.prepareInactiveView?.();
    // The same token makes this idempotent when chat and owner share a document.
    await control('open');
    if (relayOwner) {
      for (const method of ['evaluateOwner', 'evaluate']) {
        // A shared main document needs only one relay listener.
        const result = await document[method]({
          fn: linkBrowserInactiveOwner,
          args: [{ token }],
        });
        if (!result) {
          throw failure('owner-unverified');
        }
      }
      await control('status');
    }
    const result = await read(() => control('status'), token);
    await control('status');
    return result;
  } finally {
    // Release both even if admission, navigation, cancellation or the read fails.
    await Promise.allSettled(
      ['evaluate', 'evaluateOwner'].map((method) =>
        document[method]({
          fn: browserInactiveView,
          args: [{ operation: 'release', token }],
        })
      )
    );
  }
};
