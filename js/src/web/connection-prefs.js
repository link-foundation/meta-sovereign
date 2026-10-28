import { useSyncExternalStore } from 'react';

export const BROWSER_ONLY_KEY = 'metaSovereignOfferBrowserOnly';
export const CONNECTED_KEY = 'metaSovereignConnectedBefore';
export const TELEGRAM_CONNECTED_KEY = 'metaSovereignTelegramConnectedBefore';
const CHANGED = 'ms-connection-preferences';
const read = (key) => {
  try {
    return globalThis.localStorage?.getItem(key) === 'true';
  } catch {
    return false;
  }
};
const write = (key, value) => {
  try {
    globalThis.localStorage?.setItem(key, String(value));
  } catch {
    /* Connection recovery still works when browser storage is disabled. */
  }
  globalThis.dispatchEvent?.(new globalThis.Event(CHANGED));
};
const subscribe = (listener) => {
  globalThis.addEventListener?.(CHANGED, listener);
  globalThis.addEventListener?.('storage', listener);
  return () => {
    globalThis.removeEventListener?.(CHANGED, listener);
    globalThis.removeEventListener?.('storage', listener);
  };
};
const useFlag = (key) =>
  useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false
  );
export const rememberServerConnection = () => {
  if (!read(CONNECTED_KEY)) {
    write(CONNECTED_KEY, true);
  }
};
export const rememberTelegramConnection = () => {
  if (!read(TELEGRAM_CONNECTED_KEY)) {
    write(TELEGRAM_CONNECTED_KEY, true);
  }
};
export const useConnectionHistory = () => {
  const server = useFlag(CONNECTED_KEY);
  const telegram = useFlag(TELEGRAM_CONNECTED_KEY);
  return server || telegram;
};
export const useBrowserOnlyOffer = () => [
  useFlag(BROWSER_ONLY_KEY),
  (value) => write(BROWSER_ONLY_KEY, value),
];
