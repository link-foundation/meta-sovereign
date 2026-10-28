// Shared transport state for the app header. Observe existing event streams;
// never open another connection or add a notice inside a conversation.
import { useSyncExternalStore } from 'react';

const streams = new Map();
const listeners = new Set();
let reconnecting = false;
const publish = () => {
  const next = streams.size > 0 && ![...streams.values()].includes('open');
  if (next !== reconnecting) {
    reconnecting = next;
    listeners.forEach((notify) => notify());
  }
};
export const trackServerStream = () => {
  const id = {};
  let closed = false;
  streams.set(id, 'connecting');
  publish();
  return {
    state: (value) => {
      if (!closed) {
        streams.set(id, value);
        publish();
      }
    },
    close: () => {
      closed = true;
      streams.delete(id);
      publish();
    },
  };
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useServerReconnecting = () =>
  useSyncExternalStore(
    subscribe,
    () => reconnecting,
    () => false
  );
const browserSubscribe = (listener) => {
  globalThis.addEventListener?.('online', listener);
  globalThis.addEventListener?.('offline', listener);
  return () => {
    globalThis.removeEventListener?.('online', listener);
    globalThis.removeEventListener?.('offline', listener);
  };
};
const browserOnline = () => globalThis.navigator?.onLine !== false;
export const useBrowserOnline = () =>
  useSyncExternalStore(browserSubscribe, browserOnline, () => true);
