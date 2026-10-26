// The connected Telegram account on the chat screen: while the first sync
// runs the empty Chat says so instead of asking the user to connect again.
// There is no sync line and no "Sync now" (R-Y75, R-Y96): the server keeps
// the account in sync by itself and retries whatever failed until it
// works, as Telegram's own apps do; Telegram out of reach for long shows
// as Offline in the header (./telegram-online.js). Only a session Telegram
// ended asks the user for something: to sign in again.

import React from 'react';
import { useT } from './i18n.js';
import { Busy } from './spinner.js';

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

/** Cached Telegram history needs a signed-in account to fetch more. */
export const ChatAccountNotice = ({ state }) => {
  const t = useT();
  const { telegram, current } = state;
  if (
    current?.source !== 'telegram' ||
    !telegram?.ready ||
    (telegram.connected && !telegram.needsLogin)
  ) {
    return null;
  }
  return el(
    'div',
    { className: 'chat-banner', role: 'status', 'data-banner': 'sign-in' },
    [
      el(
        'span',
        { key: 't' },
        t(
          telegram.needsLogin
            ? 'header.telegramSignIn'
            : 'chat.account.disconnected'
        )
      ),
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
    ]
  );
};

/** Chat with no conversations yet, but Telegram is connected. */
export const ChatAccountEmpty = ({ telegram }) => {
  const t = useT();
  const signIn = Boolean(telegram.needsLogin);
  let detail = t('chat.account.loading');
  let loading = !signIn;
  if (signIn) {
    detail = t('header.telegramSignIn');
  } else if (telegram.kind === 'bot') {
    detail = t('chat.account.botHint');
    loading = false;
  } else if (telegram.at && !telegram.syncing && !telegram.error) {
    detail = t('chat.account.noChats');
    loading = false;
  }
  return el(
    'section',
    {
      className: 'card chat-account-empty',
      'data-state': signIn ? 'sign-in' : loading ? 'syncing' : 'idle',
      role: 'status',
      'aria-live': 'polite',
    },
    [
      el('h2', { key: 'h' }, connectedLine(t, telegram)),
      loading
        ? el(Busy, { key: 'p', role: undefined }, detail)
        : el('p', { key: 'p', className: 'meta' }, detail),
      signIn
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
