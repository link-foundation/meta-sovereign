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

import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useT, useDates } from './i18n.js';
import { parseMessageParts, strippedJpegDataUrl } from './message-parts.js';
import { mediaSrc } from './media-src.js';
import { Icon } from './icons.js';
import { closePlace } from './chat-leaving.js';
import { PeerAvatar } from './peer-avatar.js';
import { peerColorClass } from './peer-color.js';
import { MessageText } from './message-text.js';
import { menuItems } from './chat-selection.js';
import { useRowHandlers } from './chat-row.js';
import {
  MediaAudio,
  MediaCard,
  MediaFile,
  MediaRound,
  MediaSticker,
  MediaVideo,
} from './chat-media.js';

const el = React.createElement;

// ---- Avatar -------------------------------------------------------------

// A group member's photo (found by this message of theirs), else their
// initials on their colour; Telegram draws it by their last message.
export const MsgAvatar = ({ message, show, api }) => {
  if (!show) {
    return el('span', { className: 'msg-avatar-gap', 'aria-hidden': 'true' });
  }
  const name = message.senderName ?? message.sender;
  return el(PeerAvatar, {
    api,
    source: message.source ?? 'telegram',
    peer: String(message.sender ?? ''),
    name,
    className: 'msg-avatar',
    chat: chatIdOf(message.id),
    msg: netIdOf(message.id),
    title: name,
  });
};

// ---- Reply quote --------------------------------------------------------

// What the quoted message holds, in words, when it has no text.
const MEDIA_LABELS = {
  photo: 'chat.media.photoLabel',
  video: 'chat.media.videoLabel',
  gif: 'chat.media.gifLabel',
  round: 'chat.media.roundLabel',
  voice: 'chat.media.voiceLabel',
  audio: 'chat.media.audioLabel',
  sticker: 'chat.media.stickerLabel',
  file: 'chat.media.fileLabel',
};

const CARD_LABELS = {
  place: 'chat.media.place',
  contact: 'chat.media.contact',
  poll: 'chat.media.poll',
  story: 'chat.media.story',
};

/** What a message without text holds, in a word ("Photo", "Poll"). */
export const mediaLabel = (t, media) => {
  const key =
    MEDIA_LABELS[media?.type ?? media?.kind] ?? CARD_LABELS[media?.kind];
  if (media?.kind === 'poll' && media.question) {
    return `📊 ${media.question}`;
  }
  if (media?.kind === 'dice') {
    return media.emoticon;
  }
  return key ? t(key) : '';
};

export const quotedText = (t, replyRef) => {
  if (replyRef.deleted) {
    return t('chat.replyDeleted');
  }
  const text = replyRef.quoteText ?? replyRef.text ?? '';
  if (text && text !== '📎') {
    return text;
  }
  const label = mediaLabel(t, replyRef.media);
  if (label) {
    return label;
  }
  return replyRef.loaded === false ? '…' : '';
};

/**
 * The user's own name and the page's api, for a quote of their message
 * (Telegram names the user there, not "You") and its picture.
 */
export const QuoteContext = createContext({ selfName: null, api: null });

export const quotedName = (t, replyRef, selfName) => {
  if (replyRef.sender === 'me' || replyRef.senderName === 'me') {
    return selfName || t('chat.you');
  }
  return (
    replyRef.senderName ?? (replyRef.loaded === false ? '…' : t('chat.reply'))
  );
};

// The bar above a reply: who wrote the original, in their colour, and
// one line of it (Telegram's `EmbeddedMessage`); a click goes to it.
// A quoted photo, video or sticker: its small picture, sharp once the
// server has it, blurred until then (Telegram's `EmbeddedMessage`).
const QuoteThumb = ({ media, chat, msgId }) => {
  const { api } = useContext(QuoteContext);
  const [sharp, setSharp] = useState(null);
  const pictured =
    media?.kind === 'photo' ||
    (media?.kind === 'document' &&
      (media.isVideo || media.isSticker) &&
      (media.hasThumb || media.isSticker));
  useEffect(() => {
    if (!pictured || !chat || !msgId || !api?.telegramMediaUrl) {
      return undefined;
    }
    let active = true;
    api
      .telegramMediaUrl({ chat, id: msgId, size: 's' })
      .then((url) => active && setSharp(url ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, chat, msgId, pictured]);
  if (!pictured) {
    return null;
  }
  const blurred = strippedJpegDataUrl(media.strippedB64);
  const src = sharp ?? blurred;
  return src
    ? el('img', {
        className: `bubble-reply-thumb${media.isSticker ? ' is-sticker' : ''}`,
        ...mediaSrc(src),
        alt: '',
        onError: () => setSharp(null),
      })
    : null;
};

export const ReplyQuote = ({ replyRef, onScrollTo }) => {
  const t = useT();
  const { selfName } = useContext(QuoteContext);
  if (!replyRef) {
    return null;
  }
  const loaded = replyRef.sender !== null || replyRef.deleted;
  const ref = { ...replyRef, loaded };
  const senderName = quotedName(t, ref, selfName);
  const text = quotedText(t, ref);
  const label = `${t('chat.replyingTo', { name: senderName })}: ${text}`;
  const color =
    ref.sender && ref.sender !== 'me'
      ? peerColorClass(ref.sender, { name: ref.senderName })
      : '';
  const state = ref.deleted ? 'deleted' : loaded ? '' : 'loading';
  return el(
    'div',
    {
      className: ['bubble-reply', color, state].filter(Boolean).join(' '),
      role: 'button',
      tabIndex: 0,
      title: label,
      'aria-label': label,
      onClick: () => onScrollTo?.(replyRef.linkId),
      onKeyDown: (e) => e.key === 'Enter' && onScrollTo?.(replyRef.linkId),
    },
    el('span', { className: 'bubble-reply-row' }, [
      ref.deleted
        ? null
        : el(QuoteThumb, {
            key: 'thumb',
            media: ref.media,
            chat: chatIdOf(ref.linkId),
            msgId: ref.msgId,
          }),
      el('span', { key: 'lines', className: 'bubble-reply-lines' }, [
        el('span', { key: 'name', className: 'bubble-reply-name' }, senderName),
        el(
          'span',
          { key: 'text', className: 'bubble-reply-text' },
          text.length > 160 ? `${text.slice(0, 160)}…` : text || '\u00a0'
        ),
      ]),
    ])
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
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const strippedUrl =
    !failed && media?.strippedB64
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
            ...mediaSrc(imgSrc),
            // Not loaded (refused, gone): the blurred preview, or nothing,
            // never the browser's broken picture.
            onError: () => (src ? setSrc(null) : setFailed(true)),
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
      ...mediaSrc(src),
      className: 'photo-viewer-img',
      alt: '',
      onClick: (e) => e.stopPropagation(),
    })
  );
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

// Each menu item's label key and icon, as Telegram Desktop names them.
const MENU_ITEMS = {
  reply: ['chat.reply', 'reply'],
  quoteReply: ['chat.quoteReply', 'quote'],
  edit: ['chat.edit', 'edit'],
  pin: ['chat.pin', 'pin'],
  unpin: ['chat.unpin', 'pin'],
  saveAs: ['chat.saveAs', 'download'],
  copyImage: ['chat.copyImage', 'image'],
  copy: ['chat.copy', 'copy'],
  copySelected: ['chat.copySelected', 'copy'],
  copyUrl: ['chat.copyUrl', 'link'],
  copyLink: ['chat.copyLink', 'link'],
  copyPostLink: ['chat.copyPostLink', 'link'],
  forward: ['chat.forward', 'forward'],
  delete: ['chat.delete', 'trash'],
  select: ['chat.select', 'select'],
  selectBulk: ['chat.selectBulk', 'select'],
  copySelectedItems: ['chat.copySelectedItems', 'copy'],
  forwardSelected: ['chat.forwardSelected', 'forward'],
  deleteSelected: ['chat.deleteSelected', 'trash'],
  unpinSelected: ['chat.unpinSelected', 'pin'],
  clearSelection: ['chat.clearSelection', 'select'],
};

// Delete is drawn in red, as Desktop draws it.
const DANGER = new Set(['delete', 'deleteSelected']);

// What an item acts on besides the message: the text selected, the
// link, whether a photo or sticker is saved.
const itemValue = (key, { selectedText, target }) => {
  if (key === 'copySelected' || key === 'quoteReply') {
    return selectedText;
  }
  if (key === 'copyUrl') {
    return target?.url;
  }
  if (key === 'saveAs') {
    return target?.photo ? 'photo' : 'sticker';
  }
  return undefined;
};

// Kept inside the window, with this margin (px).
const MENU_MARGIN = 8;

/** Where a menu of `size` opened at `point` fits in `view`. */
export const menuPlace = (point, size, view) => {
  const fitX =
    point.x + size.width + MENU_MARGIN > view.width
      ? point.x - size.width
      : point.x;
  const fitY =
    point.y + size.height + MENU_MARGIN > view.height
      ? point.y - size.height
      : point.y;
  return {
    x: Math.max(
      MENU_MARGIN,
      Math.min(fitX, view.width - size.width - MENU_MARGIN)
    ),
    y: Math.max(
      MENU_MARGIN,
      Math.min(fitY, view.height - size.height - MENU_MARGIN)
    ),
  };
};

// The menu closes as Telegram's does: a press outside, Esc, the user
// scrolling, the window resized or left. The listeners stay for the
// menu's life and call the latest `onClose`: put back on each render,
// they would miss the very key that made React render.
const useMenuClose = (ref, onClose) => {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const close = () => latest.current();
    const outside = (e) => {
      if (!ref.current?.contains(e.target)) {
        close();
      }
    };
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    const listeners = [
      ['mousedown', outside],
      ['touchstart', outside],
      ['keydown', key],
      // The user scrolling closes it; the list moving by itself (older
      // messages loading, keeping its place) does not.
      ['wheel', outside, { capture: true, passive: true }],
      ['touchmove', outside, { capture: true, passive: true }],
      ['resize', close],
      ['blur', close],
    ];
    for (const [name, listener, capture] of listeners) {
      globalThis.addEventListener?.(name, listener, capture);
    }
    return () => {
      for (const [name, listener, capture] of listeners) {
        globalThis.removeEventListener?.(name, listener, capture);
      }
    };
  }, [ref]);
};

// Up and Down move between the items, as in a native menu.
const moveFocus = (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
    return;
  }
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll('[role="menuitem"]')];
  const at = items.indexOf(globalThis.document?.activeElement);
  const step = e.key === 'ArrowDown' ? 1 : -1;
  items[(at + step + items.length) % items.length]?.focus();
};

const ReactionsRow = ({ message, onClose, onAction, t }) =>
  el(
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

/**
 * A message's menu at `x`, `y` (the pointer): its reactions on top, then
 * `items` (./chat-selection.js `menuItems`). Drawn on the page's body so
 * no bubble clips it, and kept inside the window.
 */
export const MsgContextMenu = ({
  x,
  y,
  message,
  items,
  selectedText = '',
  target = {},
  reactions = true,
  onClose,
  onAction,
}) => {
  const t = useT();
  const ref = useRef(null);
  const [place, setPlace] = useState({ x, y });
  useMenuClose(ref, onClose);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node?.getBoundingClientRect) {
      return;
    }
    const { width, height } = node.getBoundingClientRect();
    setPlace(
      menuPlace(
        { x, y },
        { width, height },
        {
          width: globalThis.innerWidth ?? 1024,
          height: globalThis.innerHeight ?? 768,
        }
      )
    );
  }, [x, y]);
  const choose = (key) => {
    onClose();
    onAction(key, message, itemValue(key, { selectedText, target }));
  };
  const reacts = reactions && !message.pending && message.source !== undefined;
  const menu = el(
    'ul',
    {
      ref,
      className: 'msg-context-menu',
      role: 'menu',
      style: { top: place.y, left: place.x },
      onKeyDown: moveFocus,
      onContextMenu: (e) => e.preventDefault(),
    },
    [
      reacts
        ? el(ReactionsRow, { key: 'rx', message, onClose, onAction, t })
        : null,
      ...(items ?? []).map((key) => {
        const [label, icon] = MENU_ITEMS[key] ?? [key, 'more'];
        return el(
          'li',
          {
            key,
            role: 'menuitem',
            tabIndex: 0,
            'data-action': key,
            className: DANGER.has(key) ? 'msg-context-delete' : undefined,
            onClick: () => choose(key),
            onKeyDown: (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                choose(key);
              }
            },
          },
          [
            el(Icon, { key: 'i', name: icon, size: 18 }),
            el('span', { key: 'l' }, t(label)),
          ]
        );
      }),
    ]
  );
  const body = globalThis.document?.body;
  return body ? createPortal(menu, body) : menu;
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

// Esc closes a dialog, as it closes Telegram Desktop's boxes.
const useEscClose = (onClose) => {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        latest.current?.();
      }
    };
    globalThis.addEventListener?.('keydown', key);
    return () => globalThis.removeEventListener?.('keydown', key);
  }, []);
};

// ---- Delete dialog (in-page, never window.confirm) ----------------------

/**
 * Asks before `messages` (or one `message`) go: for the user only, or,
 * in a private chat when all are the user's own, for everyone too.
 */
export const DeleteDialog = ({
  message,
  messages = message ? [message] : [],
  isGroup,
  onClose,
  onDelete,
}) => {
  const t = useT();
  useEscClose(onClose);
  const allMine = messages.every((m) => m.sender === 'me');
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
    },
    el('div', { className: 'delete-dialog' }, [
      el(
        'p',
        { key: 'q' },
        messages.length > 1
          ? t('chat.deleteConfirmMany', { count: messages.length })
          : t('chat.deleteConfirm')
      ),
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
        ...(isGroup || !allMine
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

// ---- Pin dialog --------------------------------------------------------

/**
 * Asks before a pin, as Telegram does: "Pin for me and {name}" in a
 * private chat, "Pin and notify all members" in a group (both on unless
 * unticked); a channel's pin notifies its subscribers.
 */
export const PinDialog = ({ where, name = '', onClose, onPin }) => {
  const t = useT();
  useEscClose(onClose);
  const [forAll, setForAll] = useState(true);
  const ask = {
    personal: 'chat.pinAskChat',
    group: 'chat.pinAskGroup',
    channel: 'chat.pinAskChannel',
  }[where];
  const option =
    where === 'personal'
      ? t('chat.pinForBoth', { name })
      : where === 'group'
        ? t('chat.pinNotify')
        : null;
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
    },
    el('div', { className: 'delete-dialog pin-dialog' }, [
      el('h3', { key: 'h' }, t('chat.pinTitle')),
      el('p', { key: 'q' }, t(ask ?? 'chat.pinAskChat')),
      option
        ? el('label', { key: 'o', className: 'pin-dialog-option' }, [
            el('input', {
              key: 'c',
              type: 'checkbox',
              checked: forAll,
              onChange: (e) => setForAll(e.target.checked),
            }),
            el('span', { key: 'l' }, option),
          ])
        : null,
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'pin',
            type: 'button',
            className: 'primary',
            autoFocus: true,
            onClick: () => {
              onClose();
              onPin({ oneSide: !forAll, silent: !forAll });
            },
          },
          t('chat.pin')
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

// ---- Forward chat picker ------------------------------------------------

export const ForwardPicker = ({ chats, onClose, onForward }) => {
  const t = useT();
  useEscClose(onClose);
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

// The time sits in the text's last line when the text is the bubble's end.
const inlineTime = (parts) =>
  Boolean(parts.text) &&
  parts.media?.kind !== 'webpage' &&
  !(parts.reactions?.length > 0);

// CSS class for the bubble div.
const makeBubbleClass = (mine, message, parts) =>
  [
    'bubble',
    mine ? 'out' : 'in',
    message.pending ? 'pending' : null,
    message.delivery === 'failed' ? 'failed' : null,
    inlineTime(parts) ? 'inline-time' : null,
    bare(parts) ? 'bare' : null,
    parts.media && !parts.text && parts.media.kind === 'photo'
      ? 'media-only'
      : null,
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

// A message's file, by what it is (./chat-media.js).
const DOCUMENT_VIEWS = {
  video: MediaVideo,
  gif: MediaVideo,
  round: MediaRound,
  voice: MediaAudio,
  audio: MediaAudio,
  sticker: MediaSticker,
};

const BubbleMedia = ({ parts, api, chat, netId }) => {
  const media = parts.media;
  if (media?.kind === 'photo') {
    return el(MediaPhoto, { media, api, chat, msgId: netId });
  }
  if (media?.kind === 'document') {
    const view = (netId && DOCUMENT_VIEWS[media.type]) || MediaFile;
    return el(view, { media, api, chat, msgId: netId });
  }
  if (media && media.kind !== 'webpage') {
    return el(MediaCard, { media });
  }
  return null;
};

// Media drawn with no bubble around it, as Telegram draws them; a reply
// above it gets a small bubble of its own.
const bare = (parts) =>
  !parts.text &&
  !parts.fwdFrom &&
  ['sticker', 'round'].includes(parts.media?.type);

// Time row: "edited · 12:34 ✓"
const BubbleFooter = ({ parts, message, time, t, spacer = false }) =>
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
      `${time(message.timestamp)}${message.via === 'browser' ? ' · web' : ''}`,
      message.delivery
        ? el(DeliveryIcon, { key: 'd', status: message.delivery })
        : null,
    ]
  );

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
  time,
  t,
}) => [
  showName && !mine
    ? el(
        'span',
        {
          key: 'who',
          className: `bubble-name ${peerColorClass(message.sender, { name: message.senderName })}`,
        },
        message.senderName ?? message.sender
      )
    : null,
  el(ForwardHeader, { key: 'fwd', fwdFrom: parts.fwdFrom }),
  el(ReplyQuote, { key: 'rep', replyRef: parts.replyRef, onScrollTo }),
  el(BubbleMedia, { key: 'media', parts, api, chat, netId }),
  parts.text
    ? el('span', { key: 'body', className: 'bubble-body' }, [
        el(MessageText, {
          key: 'x',
          text: parts.text,
          entities: parts.entities,
        }),
        inlineTime(parts)
          ? el(BubbleFooter, {
              key: 'sp',
              parts,
              message,
              time,
              t,
              spacer: true,
            })
          : null,
      ])
    : null,
  parts.media?.kind === 'webpage'
    ? el(WebPreview, { key: 'wp', webPage: parts.media })
    : null,
  el(Reactions, { key: 'rx', reactions: parts.reactions }),
  el(BubbleFooter, { key: 'time', parts, message, time, t }),
  composer
    ? el(BubbleActionsInner, { key: 'actions', message, composer })
    : null,
];

// The bubble's marks: the id the reader has seen, how it was delivered.
const seenProps = (message, { mine, leaving, netId }) => {
  const seenId = mine || message.pending || leaving ? null : netId;
  return {
    ...(seenId ? { 'data-seen-id': seenId } : {}),
    ...(message.delivery ? { 'data-delivery': message.delivery } : {}),
  };
};

// The menu's items: the chat's own (`menuFor`), else what any message has.
const itemsOf = (menuFor, message, options) =>
  menuFor ? menuFor(message, options) : menuItems({ message, ...options });

// The message's menu, when one is open.
const openMenu = ({ menu, shown, message, menuFor, selecting, ...rest }) =>
  menu && shown
    ? el(MsgContextMenu, {
        key: 'menu',
        x: menu.x,
        y: menu.y,
        message,
        items: itemsOf(menuFor, message, {
          selectedText: menu.text,
          target: menu.target,
        }),
        selectedText: menu.text,
        target: menu.target,
        // Desktop's reactions strip tops the menu of one message.
        reactions: !selecting,
        ...rest,
      })
    : null;

// The round check a message shows while messages are selected, at the
// row's right end (Telegram Desktop).
const SelectCheck = ({ selected }) =>
  el(
    'span',
    {
      key: 'check',
      className: selected ? 'bubble-check is-checked' : 'bubble-check',
      'aria-hidden': 'true',
    },
    selected ? el(Icon, { name: 'check', size: 14 }) : null
  );

/**
 * One message bubble: renders all Telegram display parts.
 *
 * Props:
 *   message     — the link object
 *   showAvatar  — show sender avatar (on the last of a sender's run)
 *   showName    — show sender name row (on the first of a run)
 *   run         — { first, last }: where in its sender's run it is
 *   isPersonal  — personal (1-1) chat
 *   msgById     — Map<id, link> for reply lookups
 *   composer    — composer handle (for BubbleActions)
 *   api         — dom.js api
 *   onScrollTo  — (id) => void
 *   onAction    — (action, message, value) => void
 *   menuFor     — (message, { selectedText, selected }) => menu items
 *   selecting   — messages are being selected
 *   selected    — this one is among them (or a drag is taking it)
 *   onSelect    — (id, { shift }) => void
 *   fastReply   — show Desktop's corner "Reply" on hover (groups)
 */
export const MessageBubble = ({
  message,
  showAvatar,
  showName,
  run,
  isPersonal,
  msgById,
  composer,
  api,
  onScrollTo,
  onAction,
  menuFor,
  selecting = false,
  selected = false,
  onSelect,
  fastReply = false,
}) => {
  const t = useT();
  const { time } = useDates();
  const [menu, setMenu] = useState(null);
  const row = useRef(null);
  const bubble = useRef(null);
  const mine = message.sender === 'me';
  const leaving = useLeavingRow(row, message);
  const handlers = useRowHandlers({
    row,
    bubble,
    message,
    usable: Boolean(onAction) && !leaving && !message.service,
    selecting,
    onSelect,
    onAction,
    setMenu,
    quickReaction: QUICK_REACTIONS[0],
  });

  if (message.service) {
    return el(ServiceLine, { link: message });
  }

  const parts = parseMessageParts(message, msgById ?? new Map());
  const chat = chatIdOf(message.id);
  const netId = netIdOf(message.id);
  const bubbleProps = {
    key: 'bub',
    ref: bubble,
    className: makeBubbleClass(mine, message, parts),
    'data-message': message.id,
    ...seenProps(message, { mine, leaving, netId }),
  };

  return el(
    'div',
    {
      ref: row,
      ...rowProps(mine, leaving, run, { selecting, selected, id: message.id }),
      ...handlers,
    },
    [
      isPersonal || mine
        ? null
        : el(MsgAvatar, { key: 'av', message, show: showAvatar, api }),
      el('div', bubbleProps, [
        el(BubbleContent, {
          key: 'content',
          parts,
          message,
          showName,
          mine,
          api,
          chat,
          netId,
          composer,
          onScrollTo,
          time,
          t,
        }),
        fastReply && !selecting && canFastReply(message, mine, onAction)
          ? el(FastReply, {
              key: 'fast',
              onReply: () => onAction('reply', message),
              t,
            })
          : null,
      ]),
      selecting ? el(SelectCheck, { key: 'check', selected }) : null,
      openMenu({
        menu,
        shown: !leaving,
        message,
        menuFor,
        selecting,
        onClose: () => setMenu(null),
        onAction,
      }),
    ]
  );
};

const canFastReply = (message, mine, onAction) =>
  !mine && !message.pending && typeof onAction === 'function';

// Desktop's corner "Reply": in a group, at an incoming bubble's top
// right while the pointer is on it.
const FastReply = ({ onReply, t }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'bubble-fast-reply',
      onClick: (e) => {
        e.stopPropagation();
        onReply();
      },
      onDoubleClick: (e) => e.stopPropagation(),
    },
    t('chat.reply')
  );

// A leaving message's row closes its place (./chat-leaving.js).
const useLeavingRow = (row, message) => {
  const leaving = Boolean(message.leaving);
  useLayoutEffect(() => {
    const animation = leaving ? closePlace(row.current) : null;
    return () => animation?.cancel();
  }, [row, leaving]);
  return leaving;
};

// Where in a run of one sender's messages the row is: Telegram rounds
// the bubbles' inner corners between them.
const rowProps = (
  mine,
  leaving,
  run = {},
  { selecting, selected, id } = {}
) => ({
  className: [
    'bubble-row',
    leaving ? 'is-leaving' : null,
    selecting ? 'is-selectable' : null,
    selected ? 'is-selected' : null,
  ]
    .filter(Boolean)
    .join(' '),
  ...(selecting ? { 'aria-selected': selected ? 'true' : 'false' } : {}),
  ...(leaving ? {} : { 'data-row': id }),
  'data-mine': mine ? 'true' : undefined,
  'data-run-first': run.first === false ? undefined : 'true',
  'data-run-last': run.last === false ? undefined : 'true',
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
