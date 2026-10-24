// The unread GitHub notifications on the GitHub card (R-Z20), read from the
// local store (what "Fetch now" with notifications ticked saved). Each
// thread has a "Mark read" button: the only thing that changes anything on
// GitHub, and only when the user presses it. A failure that may have reached
// GitHub (`send-unknown`) is said as such and not repeated.

import React, { useEffect, useState } from 'react';
import { api } from '../dom.js';
import { errorText } from '../api-errors.js';
import { useT } from '../i18n.js';

const el = React.createElement;

/** The unread ones, newest first. */
export const unreadNotifications = (list = []) =>
  list
    .filter((n) => n?.unread !== false && n?.threadId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

const problem = (t, answer) => {
  const key = `github.notifications.error.${answer?.code}`;
  const known = t(key);
  return known && known !== key
    ? known
    : errorText(
        t,
        answer?.code,
        t('github.notifications.error.generic', { error: answer?.error ?? '' })
      );
};

const useNotifications = () => {
  const t = useT();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const load = async () => {
    const answer = await api.githubInbox('notifications');
    if (answer?.ok) {
      setList(unreadNotifications(answer.notifications));
    } else {
      setMessage(problem(t, answer));
    }
  };
  useEffect(() => {
    load();
  }, []);
  const markRead = async (threadId) => {
    setBusy(threadId);
    setMessage('');
    try {
      const answer = await api.githubInbox('notifications/read', { threadId });
      if (answer?.ok) {
        setList((now) => now.filter((n) => n.threadId !== threadId));
      } else {
        setMessage(problem(t, answer));
      }
    } finally {
      setBusy('');
    }
  };
  return { t, list, busy, message, load, markRead };
};

export const GithubNotifications = () => {
  const { t, list, busy, message, load, markRead } = useNotifications();
  return el(
    'section',
    {
      className: 'col github-notifications',
      'data-role': 'github-notifications',
    },
    [
      el('h4', { key: 'h' }, t('github.notifications.title')),
      el(
        'button',
        {
          key: 'refresh',
          type: 'button',
          'data-action': 'github-notifications-refresh',
          onClick: load,
        },
        t('github.notifications.refresh')
      ),
      list && list.length === 0
        ? el(
            'p',
            { key: 'none', className: 'meta' },
            t('github.notifications.none')
          )
        : null,
      el(
        'ul',
        { key: 'list', className: 'notification-list', role: 'list' },
        (list ?? []).map((n) =>
          el('li', { key: n.threadId, 'data-thread': n.threadId }, [
            el(
              'span',
              { key: 't', className: 'note-title' },
              n.subject?.title || n.body
            ),
            el(
              'span',
              { key: 'm', className: 'meta' },
              [n.repo, n.reason].filter(Boolean).join(' · ')
            ),
            el(
              'button',
              {
                key: 'b',
                type: 'button',
                'data-action': `github-mark-read:${n.threadId}`,
                disabled: busy !== '',
                onClick: () => markRead(n.threadId),
              },
              t('github.notifications.markRead')
            ),
          ])
        )
      ),
      el(
        'p',
        {
          key: 'message',
          className: 'meta',
          role: 'alert',
          'data-role': 'github-notifications-message',
        },
        message
      ),
    ]
  );
};
