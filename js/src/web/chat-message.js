// Chat message rendering: photos, documents, replies, forwards, reactions,
// service lines, context menus.  Imported by chat-view.js.
//
// Telegram layout conventions (from web.telegram.org/k and /a):
//   - incoming group messages show an avatar circle left of the first
//     consecutive bubble from that sender;
//   - reply quote: a coloured bar + sender name + one line of quoted text;
//   - forwarded: "Forwarded from X" above the body;
//   - reactions: emoji pill row below the body;
//   - edited: "edited" before the time;
//   - service messages: centred one-line pill.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT, useDates } from './i18n.js';
import { avatarFor } from './chat-model.js';
import { parseMessageParts, strippedJpegDataUrl } from './message-parts.js';
import { Icon } from './icons.js';
import { closePlace } from './chat-leaving.js';

const el = React.createElement;

// ---- Avatar -------------------------------------------------------------

export const MsgAvatar = ({ name, show }) => {
  if (!show) {
    return el('span', { className: 'msg-avatar-gap', 'aria-hidden': 'true' });
  }
  const { initials, hue } = avatarFor(name);
  return el(
    'span',
    {
      className: 'msg-avatar',
      style: { '--avatar-hue': hue },
      'aria-hidden': 'true',
      title: name,
    },
    initials
  );
};

// ---- Reply quote --------------------------------------------------------

export const ReplyQuote = ({ replyRef, onScrollTo }) => {
  const t = useT();
  if (!replyRef) {
    return null;
  }
  const senderName = replyRef.senderName ?? t('chat.reply');
  const text = replyRef.quoteText ?? replyRef.text ?? '';
  const label = `${t('chat.replyingTo', { name: senderName })}: ${text}`;
  return el(
    'div',
    {
      className: 'bubble-reply',
      role: 'button',
      tabIndex: 0,
      title: label,
      'aria-label': label,
      onClick: () => onScrollTo?.(replyRef.linkId),
      onKeyDown: (e) => e.key === 'Enter' && onScrollTo?.(replyRef.linkId),
    },
    [
      el('span', { key: 'name', className: 'bubble-reply-name' }, senderName),
      text
        ? el(
            'span',
            { key: 'text', className: 'bubble-reply-text' },
            text.length > 120 ? `${text.slice(0, 120)}…` : text
          )
        : null,
    ]
  );
};

// ---- Forward header -----------------------------------------------------

const ForwardHeader = ({ fwdFrom }) => {
  const t = useT();
  if (!fwdFrom) {
    return null;
  }
  const name = fwdFrom.fromName ?? t('chat.fwdFromUnknown');
  return el('div', { className: 'bubble-fwd' }, t('chat.fwdFrom', { name }));
};

// ---- Inline photo -------------------------------------------------------

// A lazy-loading photo that shows the stripped thumbnail immediately
// and fetches the real one when scrolled near view.
const MediaPhoto = ({ media, api, chat, msgId }) => {
  const t = useT();
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const [open, setOpen] = useState(false);
  const strippedUrl = media?.strippedB64
    ? strippedJpegDataUrl(media.strippedB64)
    : null;

  useEffect(() => {
    const el2 = ref.current;
    if (!el2 || !api?.telegramMediaUrl || !chat || !msgId) {
      return undefined;
    }
    const Observer = globalThis.IntersectionObserver;
    if (typeof Observer !== 'function') {
      return undefined;
    }
    let active = true;
    const obs = new Observer(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) {
          return;
        }
        obs.disconnect();
        api.telegramMediaUrl({ chat, id: msgId, size: 'm' }).then((url) => {
          if (active && url) {
            setSrc(url);
          }
        });
      },
      { rootMargin: '200px' }
    );
    obs.observe(el2);
    return () => {
      active = false;
      obs.disconnect();
    };
  }, [api, chat, msgId]);

  const ar = media?.aspectRatio ?? 4 / 3;
  const paddingTop = `${(1 / ar) * 100}%`;

  const imgSrc = src || strippedUrl;
  const blurred = !src && Boolean(strippedUrl);

  return el(
    'div',
    {
      ref,
      className: 'bubble-photo',
      style: { paddingTop },
      role: 'button',
      tabIndex: 0,
      'aria-label': t('chat.openMedia'),
      onClick: () => imgSrc && setOpen(true),
      onKeyDown: (e) => e.key === 'Enter' && imgSrc && setOpen(true),
    },
    [
      imgSrc
        ? el('img', {
            key: 'img',
            src: imgSrc,
            className: blurred
              ? 'bubble-photo-img blurred'
              : 'bubble-photo-img',
            alt: '',
            draggable: false,
          })
        : el('span', { key: 'ph', className: 'bubble-photo-placeholder' }),
      open
        ? el(PhotoViewer, {
            key: 'viewer',
            src: src || strippedUrl,
            onClose: () => setOpen(false),
            onRequestFull: async () => {
              if (!api?.telegramMediaUrl) {
                return;
              }
              const url = await api.telegramMediaUrl({
                chat,
                id: msgId,
                size: 'x',
              });
              if (url) {
                setSrc(url);
              }
            },
          })
        : null,
    ]
  );
};

// Fullscreen viewer: ESC or click overlay closes.
const PhotoViewer = ({ src, onClose, onRequestFull }) => {
  const t = useT();
  useEffect(() => {
    onRequestFull?.();
    const onKey = (e) => e.key === 'Escape' && onClose();
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
  return el(
    'div',
    {
      className: 'photo-viewer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.openMedia'),
      onClick: onClose,
    },
    el('img', {
      src,
      className: 'photo-viewer-img',
      alt: '',
      onClick: (e) => e.stopPropagation(),
    })
  );
};

// ---- Document / audio / voice indicator ---------------------------------

const MediaDocument = ({ media }) => {
  const t = useT();
  if (!media) {
    return null;
  }
  const icon = media.isVoice ? 'mic' : media.isVideo ? 'video' : 'file';
  const label = media.filename || media.mimeType || t('chat.document');
  // Another network's attachment opens where that network keeps it.
  const href = /^https:\/\//.test(media.url ?? '') ? media.url : null;
  return el('div', { className: 'bubble-doc' }, [
    el(Icon, { key: 'ic', name: icon, size: 20 }),
    href
      ? el(
          'a',
          {
            key: 'n',
            className: 'bubble-doc-name',
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          label
        )
      : el('span', { key: 'n', className: 'bubble-doc-name' }, label),
  ]);
};

// ---- Web page preview ---------------------------------------------------

const WebPreview = ({ webPage }) => {
  if (!webPage) {
    return null;
  }
  return el('div', { className: 'bubble-webpage' }, [
    webPage.siteName
      ? el(
          'span',
          { key: 'site', className: 'bubble-wp-site' },
          webPage.siteName
        )
      : null,
    webPage.title
      ? el(
          'strong',
          { key: 'title', className: 'bubble-wp-title' },
          webPage.title
        )
      : null,
    webPage.description
      ? el(
          'span',
          { key: 'desc', className: 'bubble-wp-desc' },
          webPage.description
        )
      : null,
  ]);
};

// ---- Reactions ----------------------------------------------------------

const Reactions = ({ reactions }) => {
  if (!reactions?.length) {
    return null;
  }
  return el(
    'div',
    { className: 'bubble-reactions', 'aria-label': 'Reactions' },
    reactions.map((r) =>
      el(
        'span',
        { key: r.emoticon, className: 'bubble-reaction' },
        `${r.emoticon} ${r.count}`
      )
    )
  );
};

// ---- Service line -------------------------------------------------------

export const ServiceLine = ({ link }) => {
  const t = useT();
  const { service } = parseMessageParts(link);
  if (!service) {
    return null;
  }
  let text = t(service.key);
  if (service.title) {
    text = t('chat.service.titleChangedFmt', { title: service.title });
  }
  if (service.user && service.key !== 'chat.service.pin') {
    text = `${service.user}: ${text}`;
  }
  return el(
    'div',
    {
      className: 'service-line',
      role: 'note',
      'data-message': link.id,
    },
    el('span', null, text)
  );
};

// ---- Context menu -------------------------------------------------------

/** The reactions the menu offers in one tap, as Telegram's first row. */
export const QUICK_REACTIONS = Object.freeze([
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🔥',
]);

export const MsgContextMenu = ({ x, y, message, onClose, onAction }) => {
  const t = useT();
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (!ref.current?.contains(e.target)) {
        onClose();
      }
    };
    globalThis.addEventListener?.('mousedown', handler);
    globalThis.addEventListener?.('touchstart', handler);
    return () => {
      globalThis.removeEventListener?.('mousedown', handler);
      globalThis.removeEventListener?.('touchstart', handler);
    };
  }, [onClose]);
  const mine = message.sender === 'me' || message.outgoing === true;
  const actions = [
    { key: 'reply', label: t('chat.reply') },
    ...(message.body ? [{ key: 'copy', label: t('chat.copy') }] : []),
    ...(mine && message.body ? [{ key: 'edit', label: t('chat.edit') }] : []),
    { key: 'forward', label: t('chat.forward') },
    { key: 'delete', label: t('chat.delete') },
  ];
  const reactions = el(
    'li',
    { key: 'react', role: 'none', className: 'msg-context-reactions' },
    QUICK_REACTIONS.map((emoji) =>
      el(
        'button',
        {
          key: emoji,
          type: 'button',
          role: 'menuitem',
          'aria-label': t('chat.react', { emoji }),
          onClick: () => {
            onClose();
            onAction('react', message, emoji);
          },
        },
        emoji
      )
    )
  );
  return el(
    'ul',
    {
      ref,
      className: 'msg-context-menu',
      role: 'menu',
      style: { top: y, left: x },
    },
    [
      reactions,
      ...actions.map((a) =>
        el(
          'li',
          {
            key: a.key,
            role: 'menuitem',
            tabIndex: 0,
            onClick: () => {
              onClose();
              onAction(a.key, message);
            },
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                onClose();
                onAction(a.key, message);
              }
            },
            className: a.key === 'delete' ? 'msg-context-delete' : undefined,
          },
          a.label
        )
      ),
    ]
  );
};

// ---- Edit dialog --------------------------------------------------------

export const EditDialog = ({ message, onClose, onSave }) => {
  const t = useT();
  const [text, setText] = useState(String(message.body ?? ''));
  const save = () => {
    if (text.trim() && text !== message.body) {
      onSave(text);
    }
    onClose();
  };
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.edit'),
    },
    el('div', { className: 'delete-dialog edit-dialog' }, [
      el('textarea', {
        key: 'text',
        autoFocus: true,
        rows: 4,
        value: text,
        'aria-label': t('chat.edit'),
        onChange: (e) => setText(e.target.value),
        onKeyDown: (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            onClose();
          }
        },
      }),
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          { key: 'save', type: 'button', onClick: save },
          t('common.save')
        ),
        el(
          'button',
          { key: 'cancel', type: 'button', onClick: onClose },
          t('common.cancel')
        ),
      ]),
    ])
  );
};

// ---- Delete dialog (in-page, never window.confirm) ----------------------

export const DeleteDialog = ({ message, isGroup, onClose, onDelete }) => {
  const t = useT();
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
    },
    el('div', { className: 'delete-dialog' }, [
      el('p', { key: 'q' }, t('chat.deleteConfirm')),
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'me',
            type: 'button',
            onClick: () => {
              onClose();
              onDelete({ revoke: false });
            },
          },
          t('chat.deleteForMe')
        ),
        ...(isGroup || message.sender !== 'me'
          ? []
          : [
              el(
                'button',
                {
                  key: 'all',
                  type: 'button',
                  className: 'danger',
                  onClick: () => {
                    onClose();
                    onDelete({ revoke: true });
                  },
                },
                t('chat.deleteForEveryone')
              ),
            ]),
        el(
          'button',
          { key: 'cancel', type: 'button', onClick: onClose },
          t('common.cancel')
        ),
      ]),
    ])
  );
};

// ---- Forward chat picker ------------------------------------------------

export const ForwardPicker = ({ chats, onClose, onForward }) => {
  const t = useT();
  const [q, setQ] = useState('');
  const filtered = chats.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase())
  );
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
    },
    el('div', { className: 'forward-picker' }, [
      el(
        'p',
        { key: 'title', className: 'forward-picker-title' },
        t('chat.forwardTo')
      ),
      el('input', {
        key: 'q',
        type: 'search',
        autoFocus: true,
        value: q,
        placeholder: t('chat.search'),
        'aria-label': t('chat.search'),
        onChange: (e) => setQ(e.target.value),
      }),
      el(
        'ul',
        { key: 'list', className: 'forward-picker-list' },
        filtered.slice(0, 40).map((c) =>
          el(
            'li',
            {
              key: c.key,
              role: 'button',
              tabIndex: 0,
              onClick: () => onForward(c),
              onKeyDown: (e) => e.key === 'Enter' && onForward(c),
            },
            c.name
          )
        )
      ),
      el(
        'button',
        { key: 'cancel', type: 'button', onClick: onClose },
        t('common.cancel')
      ),
    ])
  );
};

// ---- Main message bubble ------------------------------------------------

// CSS class for the bubble div.
const makeBubbleClass = (mine, pending, delivery) =>
  [
    'bubble',
    mine ? 'out' : 'in',
    pending ? 'pending' : null,
    delivery === 'failed' ? 'failed' : null,
  ]
    .filter(Boolean)
    .join(' ');

// Detect Telegram chat id from message id.
const chatIdOf = (msgId) => {
  const parts = String(msgId ?? '').split(':');
  return parts.length >= 3 ? parts[2] : null;
};

// Network message id (last numeric segment).
const netIdOf = (msgId) => {
  const tail = String(msgId ?? '')
    .split(':')
    .pop();
  return /^\d+$/.test(tail) ? Number(tail) : null;
};

// Which media element to show (photo / document / webpage).
const BubbleMedia = ({ parts, api, chat, netId }) => {
  if (parts.media?.kind === 'photo') {
    return el(MediaPhoto, { media: parts.media, api, chat, msgId: netId });
  }
  if (parts.media?.kind === 'document') {
    return el(MediaDocument, { media: parts.media });
  }
  return null;
};

// Time row: "edited · 12:34 ✓"
const BubbleFooter = ({ parts, message, time, t }) =>
  el('span', { className: 'bubble-time' }, [
    parts.edited
      ? el('span', { key: 'e', className: 'bubble-edited' }, t('chat.edited'))
      : null,
    `${time(message.timestamp)}${message.via === 'browser' ? ' · web' : ''}`,
    message.delivery
      ? el(DeliveryIcon, { key: 'd', status: message.delivery })
      : null,
  ]);

// Inner contents of one bubble div.
const BubbleContent = ({
  parts,
  message,
  showName,
  mine,
  api,
  chat,
  netId,
  composer,
  onScrollTo,
  openMenu,
  onAction,
  time,
  t,
}) => [
  showName && !mine
    ? el(
        'span',
        { key: 'who', className: 'bubble-name' },
        message.senderName ?? message.sender
      )
    : null,
  el(ForwardHeader, { key: 'fwd', fwdFrom: parts.fwdFrom }),
  el(ReplyQuote, { key: 'rep', replyRef: parts.replyRef, onScrollTo }),
  el(BubbleMedia, { key: 'media', parts, api, chat, netId }),
  parts.text
    ? el('span', { key: 'body', className: 'bubble-body' }, parts.text)
    : null,
  parts.media?.kind === 'webpage'
    ? el(WebPreview, { key: 'wp', webPage: parts.media })
    : null,
  el(Reactions, { key: 'rx', reactions: parts.reactions }),
  el(BubbleFooter, { key: 'time', parts, message, time, t }),
  composer
    ? el(BubbleActionsInner, { key: 'actions', message, composer })
    : null,
  onAction
    ? el(
        'button',
        {
          key: 'more',
          type: 'button',
          className: 'bubble-more-btn',
          'aria-label': 'More actions',
          onClick: openMenu,
        },
        '⋯'
      )
    : null,
];

/**
 * One message bubble: renders all Telegram display parts.
 *
 * Props:
 *   message     — the link object
 *   showAvatar  — show sender avatar (false in personal chats or continuation)
 *   showName    — show sender name row (false on continuation)
 *   isPersonal  — personal (1-1) chat
 *   msgById     — Map<id, link> for reply lookups
 *   composer    — composer handle (for BubbleActions)
 *   api         — dom.js api
 *   onScrollTo  — (id) => void
 *   onAction    — (action, message) => void
 */
export const MessageBubble = ({
  message,
  showAvatar,
  showName,
  isPersonal,
  msgById,
  composer,
  api,
  onScrollTo,
  onAction,
}) => {
  const t = useT();
  const { time } = useDates();
  const [menuPos, setMenuPos] = useState(null);
  const row = useRef(null);
  const mine = message.sender === 'me';
  const leaving = useLeavingRow(row, message);

  if (message.service) {
    return el(ServiceLine, { link: message });
  }

  const parts = parseMessageParts(message, msgById ?? new Map());
  const chat = chatIdOf(message.id);
  const netId = netIdOf(message.id);
  const seenId = mine || message.pending || leaving ? null : netId;

  const openMenu = (e) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setMenuPos({ x: r.left, y: r.bottom });
  };

  const bubbleClass = makeBubbleClass(mine, message.pending, message.delivery);

  const bubbleProps = {
    key: 'bub',
    className: bubbleClass,
    'data-message': message.id,
    ...(seenId ? { 'data-seen-id': seenId } : {}),
    ...(message.delivery ? { 'data-delivery': message.delivery } : {}),
    onContextMenu: onAction && !leaving ? openMenu : undefined,
  };

  return el('div', { ref: row, ...rowProps(mine, leaving) }, [
    el(MsgAvatar, {
      key: 'av',
      name: message.senderName ?? message.sender,
      show: !mine && !isPersonal && showAvatar,
    }),
    el(
      'div',
      bubbleProps,
      el(BubbleContent, {
        parts,
        message,
        showName,
        mine,
        api,
        chat,
        netId,
        composer,
        onScrollTo,
        openMenu,
        onAction,
        time,
        t,
      })
    ),
    menuPos && !leaving
      ? el(MsgContextMenu, {
          key: 'menu',
          x: menuPos.x,
          y: menuPos.y,
          message,
          onClose: () => setMenuPos(null),
          onAction,
        })
      : null,
  ]);
};

// A leaving message's row closes its place (./chat-leaving.js).
const useLeavingRow = (row, message) => {
  const leaving = Boolean(message.leaving);
  useLayoutEffect(() => {
    const animation = leaving ? closePlace(row.current) : null;
    return () => animation?.cancel();
  }, [row, leaving]);
  return leaving;
};

const rowProps = (mine, leaving) => ({
  className: leaving ? 'bubble-row is-leaving' : 'bubble-row',
  'data-mine': mine ? 'true' : undefined,
  ...(leaving ? { 'data-leaving': 'true', 'aria-hidden': 'true' } : {}),
});

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

// Retry / Delete for failed or waiting outbox messages.
const BubbleActionsInner = ({ message, composer }) => {
  const t = useT();
  if (message.delivery === 'failed') {
    return el('div', { className: 'bubble-failed', role: 'alert' }, [
      el(
        'span',
        { key: 'why' },
        message.error ?? t('chat.failure.other', { error: '' })
      ),
      el(
        'button',
        {
          key: 'retry',
          type: 'button',
          'data-action': 'retry',
          onClick: () => composer.retry(message.clientId),
        },
        t('chat.failure.retry')
      ),
      el(
        'button',
        {
          key: 'discard',
          type: 'button',
          'data-action': 'discard',
          onClick: () => composer.discard(message.clientId),
        },
        t('chat.failure.discard')
      ),
    ]);
  }
  if (message.delivery === 'waiting') {
    return el('div', { className: 'bubble-waiting', role: 'status' }, [
      el('span', { key: 'why' }, t('chat.waiting.retry', { seconds: 0 })),
      el(
        'button',
        {
          key: 'now',
          type: 'button',
          'data-action': 'retry-now',
          onClick: () => composer.retryNow(message.clientId),
        },
        t('chat.waiting.now')
      ),
      el(
        'button',
        {
          key: 'discard',
          type: 'button',
          'data-action': 'discard',
          onClick: () => composer.discard(message.clientId),
        },
        t('chat.failure.discard')
      ),
    ]);
  }
  return null;
};
