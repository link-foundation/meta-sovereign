import { useSyncExternalStore } from 'react';

export const OPERATOR_SCOPE_KEY = 'metaSovereignOperatorScope';
export const DEFAULT_OPERATOR_SCOPE = Object.freeze({
  private: true,
  group: false,
  channel: false,
});
export const readOperatorScope = (storage = globalThis.localStorage) => {
  try {
    const stored = JSON.parse(storage?.getItem(OPERATOR_SCOPE_KEY) ?? 'null');
    return Object.fromEntries(
      Object.entries(DEFAULT_OPERATOR_SCOPE).map(([kind, fallback]) => [
        kind,
        typeof stored?.[kind] === 'boolean' ? stored[kind] : fallback,
      ])
    );
  } catch {
    return DEFAULT_OPERATOR_SCOPE;
  }
};

let state;
const listeners = new Set();
const snapshot = () => (state ??= readOperatorScope());
const changed = () => listeners.forEach((notify) => notify());
const storageChanged = (event) => {
  if (!event.key || event.key === OPERATOR_SCOPE_KEY) {
    state = undefined;
    changed();
  }
};
const subscribe = (listener) => {
  listeners.add(listener);
  globalThis.addEventListener?.('storage', storageChanged);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      globalThis.removeEventListener?.('storage', storageChanged);
    }
  };
};
export const setOperatorScope = (kind, enabled) => {
  if (!(kind in DEFAULT_OPERATOR_SCOPE)) {
    return;
  }
  state = { ...snapshot(), [kind]: Boolean(enabled) };
  try {
    globalThis.localStorage?.setItem(OPERATOR_SCOPE_KEY, JSON.stringify(state));
  } catch {
    // Keep the choice for this visit when browser storage is unavailable.
  }
  changed();
};
export const useOperatorScope = () => [
  useSyncExternalStore(subscribe, snapshot, snapshot),
  setOperatorScope,
];
