// The bar at the foot of a channel post with comments, and of a group
// message others answered in its thread (R-Y126), as Telegram's apps
// show it (learned, never copied): "Leave a comment" while there is
// none, "N comments" (or "N replies" in a group) once there are, with
// a dot while some are unread; a click opens them.

import React from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;

/**
 * What a message's thread holds, from Telegram's `replies` header:
 * `{ comments, count, unread }`, or null when there is no bar to show.
 */
export const threadOf = (message) => {
  const replies = message?.raw?.replies;
  if (!replies || message.pending || message.service) {
    return null;
  }
  const count = Number(replies.replies) || 0;
  const comments = Boolean(replies.comments);
  if (!comments && count === 0) {
    return null;
  }
  const max = Number(replies.maxId) || 0;
  const read = Number(replies.readMaxId) || 0;
  return { comments, count, unread: read > 0 && max > read };
};

const labelOf = (t, thread) => {
  if (!thread.comments) {
    return t('chat.comments.replies', { count: thread.count });
  }
  return thread.count > 0
    ? t('chat.comments.count', { count: thread.count })
    : t('chat.comments.leave');
};

export const CommentsBar = ({ message, onAction }) => {
  const t = useT();
  const thread = threadOf(message);
  if (!thread || typeof onAction !== 'function') {
    return null;
  }
  return el(
    'button',
    {
      type: 'button',
      className: thread.unread ? 'bubble-comments unread' : 'bubble-comments',
      'data-action': 'comments',
      onClick: (e) => {
        e.stopPropagation();
        onAction('comments', message);
      },
      onDoubleClick: (e) => e.stopPropagation(),
    },
    [
      el(Icon, { key: 'i', name: thread.comments ? 'chat' : 'replies' }),
      el('span', { key: 'l', className: 'bubble-comments-label' }, [
        labelOf(t, thread),
      ]),
      thread.unread
        ? el('span', { key: 'u', className: 'bubble-comments-dot' })
        : null,
      el(Icon, { key: 'c', name: 'chevron-right' }),
    ]
  );
};
