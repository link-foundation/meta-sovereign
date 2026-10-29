import React from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { EffectBadge } from './chat-effects.js';
import { ViewCount } from './chat-views.js';

const el = React.createElement;

// Time row: "edited · 12:34 ✓"
export const BubbleFooter = ({
  parts,
  message,
  time,
  t,
  spacer = false,
  api,
  mine,
}) =>
  el(
    'span',
    {
      className: spacer ? 'bubble-time-spacer' : 'bubble-time',
      ...(spacer ? { 'aria-hidden': 'true' } : {}),
    },
    [
      parts.edited
        ? el('span', { key: 'e', className: 'bubble-edited' }, t('chat.edited'))
        : null,
      parts.ttl > 0
        ? el(
            'span',
            {
              key: 'ttl',
              className: 'bubble-ttl',
              'data-message-ttl': parts.ttl,
              title: t('chat.ttl.message'),
            },
            el(Icon, { name: 'timer', size: 11 })
          )
        : null,
      parts.effect
        ? spacer
          ? el('span', { key: 'fx', className: 'bubble-effect' }, '✨')
          : el(EffectBadge, { key: 'fx', id: parts.effect, message, api, mine })
        : null,
      el(ViewCount, { key: 'views', message, api, track: !spacer }),
      `${time(message.timestamp)}${message.via === 'browser' ? ' · web' : ''}`,
      message.delivery
        ? spacer
          ? el('span', { key: 'd', className: 'bubble-status-spacer' })
          : el(DeliveryIcon, { key: 'd', status: message.delivery })
        : null,
    ]
  );

// Delivery icon (clock, ✓, ✓✓, !).
const DELIVERY_ICON = {
  sending: 'clock',
  waiting: 'clock',
  stored: 'clock',
  sent: 'check',
  read: 'check-double',
  failed: 'alert',
};

const DeliveryIcon = ({ status }) => {
  const t = useT();
  const label = t(`chat.delivery.${status}`);
  return el(
    'span',
    {
      className: `bubble-status ${status}`,
      'data-delivery': status,
      title: label,
      role: 'img',
      'aria-label': label,
    },
    el(Icon, { name: DELIVERY_ICON[status] ?? 'check', size: 14 })
  );
};
