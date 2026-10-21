// The connected Telegram account on the chat screen: while the first sync
// runs (or when it failed) the empty Chat says so instead of asking the
// user to connect again, and the chat list carries a small sync line.
// There is no "Sync now" (R-Y75): the server keeps the account in sync by
// itself and retries a failed sync on its own (../sources/telegram-catchup.js),
// as Telegram's own apps do; a sync that stays failed says why.

import React from 'react';
import { useDates, useT } from './i18n.js';

const el = React.createElement;

const accountName = (account) => {
  if (!account) {
    return null;
  }
  if (account.username) {
    return `@${account.username}`;
  }
  return (
    [account.firstName, account.lastName].filter(Boolean).join(' ') || null
  );
};

const openConnections = () =>
  globalThis.dispatchEvent?.(
    new CustomEvent('meta-sovereign:navigate', {
      detail: { view: 'connections', anchor: '#conn-telegram' },
    })
  );

/** Who is connected, as one line. */
const connectedLine = (t, telegram) => {
  const name = accountName(telegram.account);
  if (telegram.kind === 'bot') {
    return t('chat.account.bot');
  }
  return name
    ? t('chat.account.connectedAs', { name })
    : t('chat.account.connected');
};

// Like Telegram's title bar: "Connecting…" while the connection is down
// (it comes back by itself), "Updating…" while a sync runs, else who is
// connected and when it last synced; a failed sync says why.
const lineText = (t, telegram, when) => {
  if (telegram.error) {
    return t('chat.account.failed', { error: telegram.error });
  }
  if (
    telegram.connection === 'disconnected' ||
    telegram.connection === 'broken'
  ) {
    return t('chat.account.connecting');
  }
  if (telegram.syncing) {
    return t('chat.account.syncing');
  }
  return [connectedLine(t, telegram), when ? ` · ${when}` : ''].join('');
};

/** Chat with no conversations yet, but Telegram is connected. */
export const ChatAccountEmpty = ({ telegram }) => {
  const t = useT();
  const failed = Boolean(telegram.error);
  let detail = t('chat.account.loading');
  if (failed) {
    detail = t('chat.account.failed', { error: telegram.error });
  } else if (telegram.kind === 'bot') {
    detail = t('chat.account.botHint');
  } else if (telegram.at && !telegram.syncing) {
    detail = t('chat.account.noChats');
  }
  return el(
    'section',
    {
      className: 'card chat-account-empty',
      'data-state': failed ? 'failed' : telegram.syncing ? 'syncing' : 'idle',
      role: 'status',
      'aria-live': 'polite',
    },
    [
      el('h2', { key: 'h' }, connectedLine(t, telegram)),
      el('p', { key: 'p', className: 'meta' }, detail),
      failed
        ? el('div', { key: 'a', className: 'row' }, [
            el(
              'button',
              {
                key: 'c',
                type: 'button',
                className: 'ghost',
                onClick: openConnections,
              },
              t('chat.account.openConnection')
            ),
          ])
        : null,
    ]
  );
};

/** The chat list's footer: the account and the last sync, or why not. */
export const ChatAccountLine = ({ telegram }) => {
  const t = useT();
  const { chatTime } = useDates();
  if (!telegram?.connected) {
    return null;
  }
  const when = telegram.at ? chatTime(telegram.at) : null;
  return el(
    'div',
    {
      className: 'chat-account-line',
      'data-state': telegram.error ? 'failed' : 'ok',
      title: telegram.error ?? undefined,
    },
    [
      el('span', { key: 't', className: 'meta' }, lineText(t, telegram, when)),
      telegram.error
        ? el(
            'button',
            {
              key: 'c',
              type: 'button',
              className: 'ghost',
              onClick: openConnections,
            },
            t('chat.account.openConnection')
          )
        : null,
    ]
  );
};
