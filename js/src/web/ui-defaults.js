import { validateUiDefaults } from '../configuration/ui-defaults.js';

let defaults = Object.freeze({});
const listeners = new Set();
export const currentUiDefaults = () => defaults;
export const subscribeUiDefaults = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const receiveUiDefaults = (value) => {
  let next;
  try {
    next = validateUiDefaults(value);
  } catch {
    // An old backend or a malformed reply cannot replace known defaults.
    return false;
  }
  if (
    ['theme', 'skin', 'language'].some((key) => defaults[key] !== next[key])
  ) {
    defaults = Object.freeze(next);
    listeners.forEach((listener) => listener());
  }
  return true;
};

/** Read on connection; ignore superseded responses and release late listeners. */
export const followUiDefaults = (api) => {
  let closed = false;
  let pending = null;
  let unsubscribe = null;
  const load = async () => {
    if (closed) {
      return;
    }
    pending?.abort();
    const owner = new AbortController();
    pending = owner;
    try {
      const value = await api.uiDefaults({ signal: owner.signal });
      if (!closed && !owner.signal.aborted && pending === owner) {
        receiveUiDefaults(value);
      }
    } catch {
      // Presentation remains usable offline; reads never change saved choices.
    }
  };
  Promise.resolve(
    api.on((event) => {
      if (event.type === 'mode-change' && event.online) {
        void load();
      } else if (event.type === 'mode-change') {
        pending?.abort();
        pending = null;
      }
    })
  )
    .then((remove) => {
      if (closed) {
        remove?.();
      } else {
        unsubscribe = remove;
      }
    })
    .catch(() => {});
  Promise.resolve(api.isOnline())
    .then((online) => online && load())
    .catch(() => {});
  return () => {
    closed = true;
    pending?.abort();
    unsubscribe?.();
  };
};
