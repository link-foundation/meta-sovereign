// A service message's line in the chat (R-Y221; learned, never copied): a
// join, a pin, a call, a gift, a new group photo. The text is worded in
// ./service-texts.js; this file draws it, with what Telegram's apps put
// under some of them: a new group photo (or a suggested profile photo) as a
// small round picture that opens, and "View" on a unique gift or gift code.

import React, { useEffect, useState } from 'react';
import { useLocaleContext } from './i18n.js';
import { parseMessageParts } from './message-parts.js';
import { fillParams } from './service-texts.js';
import { formatCallDuration } from './call-model.js';
import { GiftCodeLine } from './chat-gift-code-button.js';
import { openUniqueGift } from './gift-manage-model.js';
import { PhotoViewer } from './chat-photo.js';
import { mediaSrc } from './media-src.js';

const el = React.createElement;

// The chat and message numbers of a `msg:telegram:<chat>:<id>` link.
const partsOf = (id) => {
  const [, , chat, msg] = String(id ?? '').split(':');
  return { chat, msg: /^\d+$/.test(msg ?? '') ? Number(msg) : null };
};

const stop = (fn) => (event) => {
  event.stopPropagation();
  fn();
};

/** The photo a service message carries: round, opens in the viewer. */
const ServicePhoto = ({ link, api, view, t }) => {
  const [src, setSrc] = useState(null);
  const [open, setOpen] = useState(false);
  const { chat, msg } = partsOf(link.id);
  const load = (size) =>
    api?.telegramMediaUrl && chat && msg
      ? api
          .telegramMediaUrl({ chat, id: msg, size })
          .then((url) => url && setSrc(url))
          .catch(() => {})
      : undefined;
  useEffect(() => {
    load('s');
  }, [api, chat, msg]);
  return el(React.Fragment, null, [
    el(
      'button',
      {
        key: 'p',
        type: 'button',
        className: 'service-photo',
        'data-service-photo': link.id,
        'aria-label': t('chat.openMedia'),
        onClick: stop(() => setOpen(true)),
      },
      src ? el('img', { ...mediaSrc(src), alt: '', draggable: false }) : null
    ),
    view
      ? el(
          'button',
          {
            key: 'v',
            type: 'button',
            className: 'service-view',
            'data-action': 'service-photo-view',
            onClick: stop(() => setOpen(true)),
          },
          t('chat.service.view')
        )
      : null,
    open && src
      ? el(PhotoViewer, {
          key: 'viewer',
          src,
          onClose: () => setOpen(false),
          onRequestFull: () => load('x'),
        })
      : null,
  ]);
};

const UniqueGiftView = ({ slug, t }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'service-view',
      'data-action': 'service-gift-view',
      onClick: stop(() => openUniqueGift(slug)),
    },
    t('chat.service.view')
  );

// The words: a worded action's params filled in; an older one's name.
const textOf = (service, t, locale) => {
  if (service.params) {
    return t(service.key, fillParams(t, service.params, locale));
  }
  let text = t(service.key, { name: service.user ?? '' });
  if (service.title) {
    text = t(service.titleKey, { title: service.title });
  }
  const named = t(service.key, { name: '\u0001' }).includes('\u0001');
  if (service.user && !named && service.key !== 'chat.service.pin') {
    text = `${service.user}: ${text}`;
  }
  return text;
};

export const ServiceLine = ({ link, msgById, api = null }) => {
  const { t, locale } = useLocaleContext();
  const { service } = parseMessageParts(link, msgById ?? new Map());
  if (!service || service.hidden) {
    return null;
  }
  const length = formatCallDuration(service.duration);
  const text = textOf(service, t, locale);
  return el(
    'div',
    {
      className: service.photo ? 'service-line has-photo' : 'service-line',
      role: 'note',
      'data-message': link.id,
    },
    [
      el('span', { key: 't' }, length ? `${text} (${length})` : text),
      service.photo
        ? el(ServicePhoto, {
            key: 'ph',
            link,
            api,
            t,
            view: link.service === 'MessageActionSuggestProfilePhoto',
          })
        : null,
      service.giftSlug
        ? el(UniqueGiftView, { key: 'gv', slug: service.giftSlug, t })
        : null,
      link.service === 'MessageActionGiftCode'
        ? el(GiftCodeLine, { key: 'g', raw: link.raw })
        : null,
    ]
  );
};
