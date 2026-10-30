import React, { useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;

export const accountDeleted = (chat, info) =>
  Boolean(chat?.deletedAccount || info?.deletedAccount);

export const identityChat = (chat, info) =>
  accountDeleted(chat, info) ? { ...chat, deletedAccount: true } : chat;

export const chatDisplayName = (chat, t, info) => {
  if (accountDeleted(chat, info)) {
    return t('chat.account.deleted');
  }
  const name = info?.title || chat?.name || '';
  return chat?.source === 'telegram' &&
    chat?.personal &&
    name === String(chat.chat)
    ? t('chat.account.unnamed')
    : name;
};

export const DeletedAccountBadge = ({ chat, info }) => {
  const t = useT();
  return accountDeleted(chat, info)
    ? el(
        'span',
        {
          className: 'account-deleted-badge',
          role: 'img',
          'aria-label': t('chat.account.deleted'),
          title: t('chat.account.deleted'),
        },
        el(Icon, { name: 'user-x', size: 14 })
      )
    : null;
};

// A Telegram peer's numeric ID is not their phone number.
export const TelegramUserId = ({ chat }) => {
  const t = useT();
  const [copied, setCopied] = useState(null);
  const id = String(chat?.chat ?? '');
  if (chat?.source !== 'telegram' || !chat.personal || !/^\d+$/u.test(id)) {
    return null;
  }
  const copy = async () => {
    try {
      if (typeof globalThis.navigator?.clipboard?.writeText === 'function') {
        await globalThis.navigator.clipboard.writeText(id);
        setCopied(id);
      }
    } catch {
      // A refused clipboard write must not be shown as copied.
    }
  };
  return el('dl', { className: 'profile-user-id', 'data-user-id': id }, [
    el('dt', { key: 'label' }, t('chat.account.id')),
    el('dd', { key: 'value' }, [
      el('code', { key: 'id' }, id),
      el(
        'button',
        {
          key: 'copy',
          type: 'button',
          className: 'icon-btn',
          title: t('chat.account.copyId'),
          'aria-label': t('chat.account.copyId'),
          onClick: copy,
        },
        el(Icon, { name: copied === id ? 'check' : 'copy', size: 16 })
      ),
    ]),
  ]);
};
