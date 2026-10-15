// The small dismissible status/alert banner shown above the chat stream and
// the automations view. Both rendered an identical component; it lives here
// once, taking the view's own label map so each keeps its own wording.

import React from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;

/** Why a run queued nothing for this chat, in words when we have them. */
export const reasonText = (t, reason) => {
  if (!reason) {
    return t('automations.reason.none');
  }
  const key = `automations.reason.${reason}`;
  const text = t(key);
  return text === key ? reason : text;
};

export const Notice = ({ notice, labels, dismiss }) => {
  const t = useT();
  if (!notice) {
    return null;
  }
  return el(
    'div',
    {
      className: `chat-notice ${notice.kind}`,
      role: notice.kind === 'failed' ? 'alert' : 'status',
      'data-notice': notice.kind,
    },
    [
      el(
        'span',
        { key: 'text' },
        t(labels[notice.kind] ?? labels.failed, {
          count: notice.count ?? 0,
          name: notice.name ?? '',
          error: notice.error ?? '',
          reason: reasonText(t, notice.reason),
        })
      ),
      el(
        'button',
        {
          key: 'x',
          type: 'button',
          className: 'icon-btn',
          'aria-label': t('chat.notice.dismiss'),
          title: t('chat.notice.dismiss'),
          onClick: dismiss,
        },
        el(Icon, { name: 'close', size: 16 })
      ),
    ]
  );
};
