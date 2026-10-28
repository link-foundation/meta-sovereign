// Once opened, a conversation is work until Done. Telegram can clear its
// unread count after sending or reading on another device; that is not Done.
import { useSyncExternalStore } from 'react';
import { activeAccount } from './telegram-account-scope.js';

export const OPERATOR_WORK_KEY = 'metaSovereignOperatorWork';
export const readOperatorWork = (
  storage = globalThis.sessionStorage,
  account = activeAccount()
) => {
  try {
    const value = JSON.parse(
      storage?.getItem(`${OPERATOR_WORK_KEY}:${account}`) ?? '{}'
    );
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key, work]) =>
          key.includes(':') &&
          work &&
          Number.isFinite(work.unread) &&
          work.unread > 0
      )
    );
  } catch {
    return {};
  }
};
const accounts = new Map();
const listeners = new Set();
const snapshot = () => {
  const account = activeAccount();
  if (!accounts.has(account)) {
    accounts.set(account, readOperatorWork());
  }
  return accounts.get(account);
};
const change = (next) => {
  accounts.set(activeAccount(), next);
  try {
    globalThis.sessionStorage?.setItem(
      `${OPERATOR_WORK_KEY}:${activeAccount()}`,
      JSON.stringify(next)
    );
  } catch {
    /* Work still lasts for this page when storage is unavailable. */
  }
  listeners.forEach((listener) => listener());
};
export const retainOperatorWork = (chat) => {
  const before = snapshot();
  if (chat?.unread > 0 && !before[chat.key]) {
    change({ ...before, [chat.key]: { unread: chat.unread } });
  }
};
export const finishOperatorWork = (key) => {
  const { [key]: _done, ...rest } = snapshot();
  change(rest);
};
export const useOperatorWork = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    snapshot
  );
