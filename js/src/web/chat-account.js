// The connected Telegram account on the chat screen: while the first sync
// runs (or when it failed) the empty Chat says so instead of asking the
// user to connect again, and the chat list carries a small sync line.

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

const SyncButton = ({ telegram, primary = false }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: primary ? 'primary' : 'ghost',
      disabled: telegram.syncing,
      onClick: () => telegram.syncNow().catch(() => {}),
    },
    telegram.syncing ? t('chat.account.syncing') : t('chat.account.syncNow')
  );
};

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
      el('div', { key: 'a', className: 'row' }, [
        el(SyncButton, { key: 's', telegram, primary: true }),
        failed
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
      ]),
    ]
  );
};

/** The chat list's footer: the account, the last sync, Sync now. */
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
      el(
        'span',
        { key: 't', className: 'meta' },
        telegram.error
          ? t('chat.account.failedShort')
          : [connectedLine(t, telegram), when ? ` · ${when}` : ''].join('')
      ),
      el(SyncButton, { key: 's', telegram }),
    ]
  );
};
