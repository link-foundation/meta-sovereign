// The account switcher, as Telegram Desktop's main menu has it (R-Y198;
// learned, never copied): each signed-in account with its avatar and
// name, "Add account" (3 accounts, 5 with Premium) and Log out of an
// extra account, after a confirmation. Account 1 is the existing single
// account: it is the one the app shows, and it is never logged out here.
// Another account shows its chat list, read live and read-only, with the
// other accounts' unread counts; opening and answering its chats is not
// done yet (see src/sources/telegram-accounts.js). Nothing is written
// here except by Add account (the existing sign-in) and Log out.

import React, { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { PeerAvatar } from './peer-avatar.js';
import { avatarFor } from './chat-model.js';
import { peerColorClass } from './peer-color.js';
import { TelegramLoginForm } from './connections/telegram-sessions.js';

const el = React.createElement;

/** The count on a badge: nothing for 0 or unknown, "99+" above 99. */
export const unreadBadge = (count) =>
  !(count > 0) ? '' : count > 99 ? '99+' : String(count);

/** What an account is called: its name, @username, else "Account N". */
export const accountLabel = (t, account) =>
  account.name ||
  (account.username ? `@${account.username}` : null) ||
  t('chat.accounts.slot', { n: account.account });

/** `accounts` with the unread counts of `unread` ([{ account, unread }]). */
export const withUnread = (accounts, unread) => {
  const by = new Map((unread ?? []).map((u) => [u.account, u.unread]));
  return accounts.map((a) => ({ ...a, unread: by.get(a.account) ?? null }));
};

// The list, asked on open and when `reload` changes; the other accounts'
// unread counts afterwards (they dial Telegram, so they come later).
const useAccounts = (api, reload) => {
  const [state, setState] = useState({ phase: 'loading', accounts: [] });
  useEffect(() => {
    let live = true;
    api
      .telegramAccounts()
      .then((a) => {
        if (!live) {
          return null;
        }
        setState(
          a?.ok
            ? { ...a, phase: 'ready', accounts: a.accounts ?? [] }
            : { phase: 'error', accounts: [] }
        );
        return a?.ok && a.accounts.length > 1
          ? api.telegramAccountsUnread()
          : null;
      })
      .then(
        (u) =>
          live &&
          u?.ok &&
          setState((was) => ({
            ...was,
            accounts: withUnread(was.accounts, u.unread),
          }))
      )
      .catch(() => live && setState({ phase: 'error', accounts: [] }));
    return () => {
      live = false;
    };
  }, [api, reload]);
  return state;
};

const AccountAvatar = ({ api, account, name }) =>
  account.id
    ? el(PeerAvatar, {
        api,
        source: 'telegram',
        peer: account.id,
        name,
        size: 's',
      })
    : el(
        'span',
        {
          className: `avatar peer-avatar ${peerColorClass(`account-${account.account}`, { name })}`,
          'aria-hidden': 'true',
        },
        el(
          'span',
          { className: 'peer-avatar-initials' },
          avatarFor(name).initials
        )
      );

const AccountRow = ({ api, t, account, onOpen, onLogout }) => {
  const name = accountLabel(t, account);
  const badge = unreadBadge(account.unread);
  return el(
    'li',
    {
      className: 'account-row',
      'data-account': account.account,
      'data-current': account.current ? 'true' : undefined,
    },
    [
      el(
        'button',
        {
          key: 'o',
          type: 'button',
          className: 'member-open account-open',
          'data-action': 'open-account',
          onClick: () => onOpen(account),
        },
        [
          el(AccountAvatar, { key: 'a', api, account, name }),
          el('span', { key: 'n', className: 'contact-text' }, [
            el('span', { key: 'n', className: 'member-name' }, name),
            el(
              'span',
              { key: 's', className: 'meta' },
              account.current
                ? t('chat.accounts.current')
                : account.username
                  ? `@${account.username}`
                  : ''
            ),
          ]),
          badge
            ? el(
                'span',
                {
                  key: 'u',
                  className: 'account-unread',
                  'data-unread': account.unread,
                },
                badge
              )
            : null,
        ]
      ),
      account.current
        ? null
        : el(
            'button',
            {
              key: 'x',
              type: 'button',
              className: 'account-logout',
              'data-action': 'account-logout',
              onClick: () => onLogout(account),
            },
            t('chat.accounts.logout')
          ),
    ]
  );
};

// Another account's chat list, read live.
const ChatsView = ({ api, t, account, back }) => {
  const [state, setState] = useState({ phase: 'loading', dialogs: [] });
  useEffect(() => {
    let live = true;
    api
      .telegramAccountsDialogs({ account: account.account })
      .then(
        (a) =>
          live &&
          setState(
            a?.ok
              ? { phase: 'ready', dialogs: a.dialogs ?? [] }
              : { phase: 'error', dialogs: [] }
          )
      )
      .catch(() => live && setState({ phase: 'error', dialogs: [] }));
    return () => {
      live = false;
    };
  }, [api, account.account]);
  return el(
    'div',
    { className: 'accounts-chats', 'data-account-chats': account.account },
    [
      el('div', { key: 'h', className: 'accounts-chats-head' }, [
        el(
          'button',
          {
            key: 'b',
            type: 'button',
            'data-action': 'accounts-back',
            onClick: back,
          },
          t('chat.accounts.back')
        ),
        el('strong', { key: 't' }, accountLabel(t, account)),
      ]),
      el('p', { key: 'p', className: 'meta' }, t('chat.accounts.preview')),
      state.phase === 'loading'
        ? el('p', { key: 'l', className: 'meta' }, t('chat.accounts.loading'))
        : null,
      state.phase === 'error'
        ? el(
            'p',
            { key: 'f', className: 'comments-failed', role: 'alert' },
            t('chat.accounts.failed')
          )
        : null,
      state.phase === 'ready' && state.dialogs.length === 0
        ? el('p', { key: 'n', className: 'meta' }, t('chat.accounts.noChats'))
        : null,
      el(
        'ul',
        { key: 'u', className: 'member-list accounts-dialogs' },
        state.dialogs.map((d) =>
          el(
            'li',
            {
              key: d.chat,
              className: 'account-dialog',
              'data-chat-row': d.chat,
            },
            [
              el('span', { key: 'n', className: 'member-name' }, d.name ?? ''),
              el('span', { key: 't', className: 'meta' }, d.text),
              d.unread > 0
                ? el(
                    'span',
                    { key: 'u', className: 'account-unread' },
                    unreadBadge(d.unread)
                  )
                : null,
            ]
          )
        )
      ),
    ]
  );
};

// Log out of an extra account: asks first.
const LogoutView = ({ api, t, account, back, done }) => {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const answer = await api
      .telegramAccountsLogout({ account: account.account })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      done();
    } else {
      setFailed(true);
    }
  };
  return el(
    'div',
    { className: 'accounts-logout', 'data-account-logout': account.account },
    [
      el(
        'strong',
        { key: 't' },
        t('chat.accounts.logoutTitle', { name: accountLabel(t, account) })
      ),
      el('p', { key: 'p', className: 'meta' }, t('chat.accounts.logoutBody')),
      failed
        ? el(
            'p',
            { key: 'f', className: 'comments-failed', role: 'alert' },
            t('chat.accounts.failed')
          )
        : null,
      el('div', { key: 'b', className: 'accounts-actions' }, [
        el(
          'button',
          {
            key: 'c',
            type: 'button',
            'data-action': 'account-logout-cancel',
            onClick: back,
          },
          t('chat.accounts.cancel')
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'account-logout-confirm',
            disabled: busy,
            onClick: confirm,
          },
          t('chat.accounts.logout')
        ),
      ]),
    ]
  );
};

const ListView = ({ api, t, state, open, logout, add }) =>
  el('div', { className: 'accounts-list-view' }, [
    state.phase === 'loading'
      ? el('p', { key: 'l', className: 'meta' }, t('chat.accounts.loading'))
      : null,
    state.phase === 'error'
      ? el(
          'p',
          { key: 'f', className: 'comments-failed', role: 'alert' },
          t('chat.accounts.failed')
        )
      : null,
    el(
      'ul',
      { key: 'u', className: 'member-list accounts-list' },
      state.accounts.map((account) =>
        el(AccountRow, {
          key: account.account,
          api,
          t,
          account,
          onOpen: open,
          onLogout: logout,
        })
      )
    ),
    state.phase === 'ready'
      ? el(
          'button',
          {
            key: 'a',
            type: 'button',
            className: 'accounts-add',
            'data-action': 'account-add',
            disabled: !state.canAdd,
            onClick: add,
          },
          t('chat.accounts.add')
        )
      : null,
    state.phase === 'ready' && !state.canAdd
      ? el(
          'p',
          { key: 'm', className: 'meta' },
          t('chat.accounts.limit', { limit: state.limit })
        )
      : null,
  ]);

/** The window: the accounts, and the views Add, chats and Log out. */
export const AccountsDialog = ({ api, close }) => {
  const t = useT();
  const [view, setView] = useState({ name: 'list' });
  const [reload, setReload] = useState(0);
  const state = useAccounts(api, reload);
  const list = useCallback(() => {
    setView({ name: 'list' });
    setReload((n) => n + 1);
  }, []);
  const open = (account) =>
    account.current ? close() : setView({ name: 'chats', account });
  let body;
  if (view.name === 'chats') {
    body = el(ChatsView, { api, t, account: view.account, back: list });
  } else if (view.name === 'logout') {
    body = el(LogoutView, {
      api,
      t,
      account: view.account,
      back: list,
      done: list,
    });
  } else if (view.name === 'add') {
    body = el('div', { className: 'accounts-add-view' }, [
      el(TelegramLoginForm, {
        key: 'f',
        account: view.slot,
        onConnected: () => setReload((n) => n + 1),
      }),
      el(
        'button',
        {
          key: 'b',
          type: 'button',
          'data-action': 'accounts-back',
          onClick: list,
        },
        t('chat.accounts.back')
      ),
    ]);
  } else {
    body = el(ListView, {
      api,
      t,
      state,
      open,
      logout: (account) => setView({ name: 'logout', account }),
      add: () => setView({ name: 'add', slot: state.next }),
    });
  }
  return el(
    Frame,
    { title: t('chat.accounts.title'), close, name: 'accounts' },
    body
  );
};

/** The menu entry and the window it opens. */
export const useAccountsWindow = ({ api }) => {
  const [shown, setShown] = useState(false);
  const close = useCallback(() => setShown(false), []);
  return {
    open: () => setShown(true),
    dialog: shown ? el(AccountsDialog, { key: 'accounts', api, close }) : null,
  };
};
