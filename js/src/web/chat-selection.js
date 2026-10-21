/**
 * Message menu and selection as Telegram's apps have them (R-Y67).
 *
 * The menu lists what can be done with one message in Telegram Web A's
 * order (MessageContextMenu): Reply, Edit, Copy Text (or Copy Selected
 * Text when some of it is selected), Copy Link, Pin/Unpin, Forward,
 * Select, Delete. "Select" starts selection mode: each message shows a
 * round check, a click (Shift+click for a range) adds or takes one, and
 * a bar in place of the composer says how many are selected and offers
 * Copy, Forward and Delete; Esc leaves it, Ctrl/Cmd+C copies, Delete
 * deletes. Several messages copy as Telegram Desktop does: each under
 * "Name, [DD.MM.YYYY HH:MM]".
 *
 * Learned from the official clients, never copied (see
 * docs/CHAT-REFERENCES.md): telegram-tt `MessageContextMenu.tsx`,
 * `MessageSelectToolbar.tsx`, `useOuterHandlers.ts`; tweb
 * `components/chat/contextMenu.ts`, `components/chat/selection.ts`.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { networkMessageId } from './chat-model.js';
import { Icon } from './icons.js';
import { useT } from './i18n.js';

const el = React.createElement;

// Telegram forwards at most this many at once (forwarded_count_max).
export const MAX_SELECTED = 100;
// Telegram lets a message be edited for two days (edit_time_limit).
const EDIT_LIMIT_MS = 48 * 60 * 60_000;

export const isMine = (message) =>
  message?.sender === 'me' || message?.outgoing === true;

const timeOf = (message) => Date.parse(message?.timestamp ?? '') || null;

const canEdit = (message, now) => {
  if (!isMine(message) || !message.body || message.pending) {
    return false;
  }
  const at = timeOf(message);
  return at === null || now - at <= EDIT_LIMIT_MS;
};

/**
 * The message's t.me link: a channel's or supergroup's messages have
 * one (by its username, else the members-only /c/ form); other chats'
 * do not.
 */
export const messageLink = (message, { chat, username = null } = {}) => {
  const id = networkMessageId(message);
  const where = String(chat ?? '');
  if (
    message?.source !== 'telegram' ||
    message.pending ||
    !id ||
    !where.startsWith('-100')
  ) {
    return null;
  }
  return username
    ? `https://t.me/${username}/${id}`
    : `https://t.me/c/${where.slice(4)}/${id}`;
};

// Anyone pins in a private chat; a group or channel says if they may.
const canPin = (message, { personal, info }) =>
  message?.source === 'telegram' &&
  !message.pending &&
  networkMessageId(message) !== null &&
  (Boolean(personal) || info?.canPin === true);

const pinItem = (message, where) => {
  if (!canPin(message, where)) {
    return null;
  }
  return message.raw?.pinned ? 'unpin' : 'pin';
};

// Copy Selected Text when part of the text is selected, else Copy Text.
const copyItem = (message, selectedText) => {
  if (selectedText) {
    return 'copySelected';
  }
  return message.body ? 'copy' : null;
};

/**
 * The menu's items for `message`, in Telegram's order. `chat` is the open
 * chat ({ chat, personal }), `info` its chat info ({ username, canPin }),
 * `selectedText` what is selected inside the bubble, `selected` whether
 * the message is in the selection.
 */
export const menuItems = ({
  message,
  chat = {},
  info = null,
  selectedText = '',
  selected = false,
  now = Date.now(),
}) => {
  const sent = !message.pending;
  const link = messageLink(message, {
    chat: chat.chat,
    username: info?.username,
  });
  return [
    sent && 'reply',
    canEdit(message, now) && 'edit',
    copyItem(message, selectedText),
    link && 'copyLink',
    pinItem(message, { personal: chat.personal, info }),
    sent && 'forward',
    sent && (selected ? 'unselect' : 'select'),
    'delete',
  ].filter(Boolean);
};

/**
 * The selection after a click on message `id`: added, or taken away when
 * it was in; with `shift`, every message from the last one clicked
 * (`anchor`) to it is added, in `order` (the ids shown). At most
 * MAX_SELECTED are kept. → `{ ids, anchor }`
 */
export const toggleSelected = (
  { ids = [], anchor = null } = {},
  id,
  { shift = false, order = [] } = {}
) => {
  const from = order.indexOf(anchor);
  const to = order.indexOf(id);
  if (shift && from !== -1 && to !== -1) {
    const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    const next = [...ids, ...range.filter((one) => !ids.includes(one))];
    return { ids: next.slice(0, MAX_SELECTED), anchor: id };
  }
  if (ids.includes(id)) {
    return { ids: ids.filter((one) => one !== id), anchor: id };
  }
  return {
    ids: ids.length >= MAX_SELECTED ? ids : [...ids, id],
    anchor: id,
  };
};

const pad = (n) => String(n).padStart(2, '0');

// "21.10.2026 15:21", in the reader's time zone.
const stamp = (message) => {
  const at = timeOf(message);
  if (at === null) {
    return '';
  }
  const d = new Date(at);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * The text Copy puts on the clipboard: one message as it is; several in
 * time order, each under "Name, [DD.MM.YYYY HH:MM]", a blank line apart.
 * `me` names the user's own messages.
 */
export const selectionText = (messages, { me = 'You' } = {}) => {
  const withText = messages.filter((m) => m?.body);
  if (withText.length === 1) {
    return String(withText[0].body);
  }
  return [...withText]
    .sort(
      (a, b) =>
        (timeOf(a) ?? 0) - (timeOf(b) ?? 0) ||
        (networkMessageId(a) ?? 0) - (networkMessageId(b) ?? 0)
    )
    .map((m) => {
      const name = isMine(m) ? me : (m.senderName ?? m.sender ?? '');
      return `${name}, [${stamp(m)}]\n${m.body}`;
    })
    .join('\n\n');
};

/** The text selected inside `node` (a bubble), or ''. */
export const selectedTextIn = (node) => {
  const selection = globalThis.getSelection?.();
  const text = selection?.toString?.() ?? '';
  if (!text.trim() || !node || selection.rangeCount === 0) {
    return '';
  }
  const range = selection.getRangeAt(0);
  return node.contains(range.commonAncestorContainer) ? text : '';
};

/**
 * The open chat's selection: `{ active, ids, has(id), toggle(id,
 * { shift, order }), start(id), clear() }`. It ends when the chat
 * changes, and when its last message is taken away.
 */
export const useSelection = (chatKey) => {
  const [state, setState] = useState({ ids: [], anchor: null });
  useEffect(() => setState({ ids: [], anchor: null }), [chatKey]);
  const toggle = useCallback(
    (id, options) => setState((before) => toggleSelected(before, id, options)),
    []
  );
  const start = useCallback((id) => setState({ ids: [id], anchor: id }), []);
  const clear = useCallback(() => setState({ ids: [], anchor: null }), []);
  return useMemo(() => {
    const held = new Set(state.ids);
    return {
      active: state.ids.length > 0,
      ids: state.ids,
      has: (id) => held.has(id),
      toggle,
      start,
      clear,
    };
  }, [state, toggle, start, clear]);
};

const isTyping = (target) =>
  Boolean(target?.closest?.('input, textarea, [contenteditable="true"]'));

/**
 * Selection keys, as in Telegram: Esc leaves, Ctrl/Cmd+C copies (unless
 * some text is selected, which copies as usual), Delete or Backspace
 * asks to delete.
 */
export const useSelectionKeys = (selection, { onCopy, onDelete }) => {
  // The latest handlers, so the listener stays put while selecting.
  const latest = useRef({ selection, onCopy, onDelete });
  latest.current = { selection, onCopy, onDelete };
  const active = selection.active;
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onKey = (event) => {
      const now = latest.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        now.selection.clear();
        return;
      }
      if (isTyping(event.target)) {
        return;
      }
      const copying =
        (event.ctrlKey || event.metaKey) &&
        String(event.key).toLowerCase() === 'c';
      if (copying && !globalThis.getSelection?.()?.toString?.()) {
        event.preventDefault();
        now.onCopy();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        now.onDelete();
      }
    };
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, [active]);
};

/**
 * The bar in the composer's place while messages are selected: close,
 * "N messages selected", then Copy, Forward and Delete.
 */
export const SelectionBar = ({
  count,
  onClear,
  onCopy,
  onForward,
  onDelete,
}) => {
  const t = useT();
  const button = (key, icon, label, onClick, className) =>
    el(
      'button',
      {
        key,
        type: 'button',
        className: className ?? 'ghost',
        'data-action': key,
        'aria-label': label,
        title: label,
        onClick,
      },
      [
        el(Icon, { key: 'i', name: icon, size: 18 }),
        el('span', { key: 'l', className: 'selection-bar-label' }, label),
      ]
    );
  return el(
    'div',
    { className: 'selection-bar', role: 'toolbar', 'aria-live': 'polite' },
    [
      el(
        'button',
        {
          key: 'clear',
          type: 'button',
          className: 'ghost selection-bar-clear',
          'aria-label': t('chat.selection.clear'),
          title: t('chat.selection.clear'),
          onClick: onClear,
        },
        el(Icon, { name: 'close', size: 18 })
      ),
      el(
        'span',
        { key: 'count', className: 'selection-bar-count' },
        t('chat.selection.count', { count })
      ),
      el('span', { key: 'gap', className: 'selection-bar-gap' }),
      button('copy', 'copy', t('chat.selection.copy'), onCopy),
      button('forward', 'forward', t('chat.forward'), onForward),
      button(
        'delete',
        'trash',
        t('chat.delete'),
        onDelete,
        'ghost selection-bar-delete'
      ),
    ]
  );
};
