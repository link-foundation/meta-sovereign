// Using more than one Telegram account in the chat (R-Y202; learned, never
// copied): the tab shows one account at a time, chosen in the Accounts
// window, and is told when the others get a message, as Telegram Desktop
// does. The choice is the tab's (./telegram-account-scope.js); changing
// it reloads the page, so nothing of the old account stays on screen.

import { useEffect, useState } from 'react';
import { activeAccount, setActiveAccount } from './telegram-account-scope.js';

/** A window event the badge listens to: another account got a message. */
export const ACCOUNT_MESSAGE = 'meta-sovereign:account-message';
const SUMMARY_MS = 60_000;

/** The other accounts' unread, summed (`active` is the one on screen). */
export const sumOthers = (unread, active) =>
  (unread ?? [])
    .filter((u) => u.account !== active)
    .reduce((sum, u) => sum + (u.unread > 0 ? u.unread : 0), 0);

/**
 * Show account `slot` (and its chat `chat`, when given): kept for the
 * tab, then the page loads again on it. `env` is the window.
 */
export const switchAccount = (slot, chat = null, env = globalThis) => {
  setActiveAccount(slot);
  if (env.location) {
    env.location.hash = chat ? `chat=telegram:${encodeURIComponent(chat)}` : '';
    env.location.reload();
  }
};

/** What a notification of another account's message says. */
export const accountNotification = (t, event, name, preview = true) =>
  preview
    ? {
        title: `${event.chatName ?? t('appName')} · ${name}`,
        body: event.sender ? `${event.sender}: ${event.body}` : event.body,
      }
    : {
        title: `${t('appName')} · ${name}`,
        body: t('chat.notify.hidden'),
      };

/** The accounts on the server and the others' unread (null while loading). */
export const useAccountsSummary = (api) => {
  const [state, setState] = useState({ accounts: null, unread: [] });
  useEffect(() => {
    if (typeof api?.telegramAccounts !== 'function') {
      return undefined;
    }
    let live = true;
    const load = async () => {
      const list = await api.telegramAccounts().catch(() => null);
      if (!live || !list?.ok) {
        return;
      }
      const many = (list.accounts ?? []).length > 1;
      const unread = many
        ? await api.telegramAccountsUnread({ all: true }).catch(() => null)
        : null;
      if (live) {
        setState({
          accounts: list.accounts ?? [],
          unread: unread?.ok ? unread.unread : [],
        });
      }
    };
    load();
    const timer = globalThis.setInterval?.(load, SUMMARY_MS);
    globalThis.addEventListener?.(ACCOUNT_MESSAGE, load);
    return () => {
      live = false;
      globalThis.clearInterval?.(timer);
      globalThis.removeEventListener?.(ACCOUNT_MESSAGE, load);
    };
  }, [api]);
  const active = activeAccount();
  return {
    active,
    accounts: state.accounts,
    current: state.accounts?.find((a) => a.account === active) ?? null,
    others: sumOthers(state.unread, active),
  };
};
