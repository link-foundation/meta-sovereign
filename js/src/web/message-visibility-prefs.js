import { useMemo, useSyncExternalStore } from 'react';
import { getLocalStorage } from '../storage/local-storage.js';
import { activeAccount } from './telegram-account-scope.js';
import {
  authorKey,
  authorSlot,
  messageAuthor,
  messageVisibility,
  storedAuthor,
} from './message-visibility.js';

export const HIDDEN_SENDERS_KEY = 'metaSovereignHiddenSenders';
const EMPTY = Object.freeze([]);
const listeners = new Set();
let records;

const read = () => {
  try {
    const saved = JSON.parse(
      getLocalStorage()?.getItem(HIDDEN_SENDERS_KEY) ?? '[]'
    );
    return Array.isArray(saved) ? saved.filter(storedAuthor) : EMPTY;
  } catch {
    return EMPTY;
  }
};
const snapshot = () => (records ??= read());
const changed = () => listeners.forEach((listener) => listener());
const storageChanged = (event) => {
  if (event.key === null || event.key === HIDDEN_SENDERS_KEY) {
    records = undefined;
    changed();
  }
};
const subscribe = (listener) => {
  listeners.add(listener);
  globalThis.addEventListener?.('storage', storageChanged);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      globalThis.removeEventListener?.('storage', storageChanged);
    }
  };
};

export const setSenderHidden = (author, hidden, account = activeAccount()) => {
  const record = { ...author, slot: authorSlot(author?.source, account) };
  if (!storedAuthor(record)) {
    return;
  }
  const key = authorKey(record);
  const matches = (entry) =>
    entry.slot === record.slot && authorKey(entry) === key;
  const current = snapshot();
  if (current.some(matches) === hidden) {
    return;
  }
  records = hidden
    ? [...current, record]
    : current.filter((entry) => !matches(entry));
  try {
    getLocalStorage()?.setItem(HIDDEN_SENDERS_KEY, JSON.stringify(records));
  } catch {
    // Keep the choice in this page if browser storage is unavailable.
  }
  changed();
};

export const hideMessageSender = (message, notify) => {
  const author = messageAuthor(message);
  if (author) {
    setSenderHidden(author, true);
    notify?.({ kind: 'sender-hidden', name: author.name });
  }
};

const useRecords = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY);

export const useHiddenSenders = () => {
  const all = useRecords();
  const slot = activeAccount();
  return useMemo(
    () => all.filter((entry) => entry.slot === authorSlot(entry.source, slot)),
    [all, slot]
  );
};

export const useMessageVisibility = () => {
  const all = useRecords();
  const slot = activeAccount();
  return useMemo(() => messageVisibility(all, slot), [all, slot]);
};

export const senderHiddenFor = (message, slot) =>
  messageVisibility(snapshot(), slot).hides(message);
