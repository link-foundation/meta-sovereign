/**
 * Message menu and selection as Telegram Desktop has them (R-Y67, R-Y68).
 *
 * The menu (HistoryInner::showContextMenu) lists, with nothing selected:
 * Reply (Quote & Reply when part of the text is selected), Edit,
 * Pin/Unpin, Retract Vote and Stop Poll on a poll (R-Y74), Save As… and
 * Copy Image on a photo (Save As… on a sticker),
 * Copy Text (Copy Selected Text), Copy Link on a link else Copy Message
 * Link (Copy Post Link in a channel), Forward, Delete, Select. While
 * messages are selected it lists, on one of them: Reply, Copy Selected
 * as Text, Forward Selected, Delete Selected, Unpin Selected, Clear
 * Selection; on another: Reply, Select, Select up to this message.
 *
 * Selecting: "Select" picks a message; once some are picked a click
 * anywhere on a row picks or drops it, and a drag from one row to
 * another picks (or drops, when it began on a picked one) every row
 * between — at most 100. A drag that leaves the message it began in
 * turns a text selection into a selection of messages. The chat's top
 * bar then shows FORWARD n, DELETE n and CANCEL; Esc clears, Ctrl/Cmd+C
 * copies, Delete asks to delete. Several messages copy as Desktop's
 * do: "[date time] Name: text", one a line.
 *
 * Learned from the official clients, never copied (see
 * docs/CHAT-REFERENCES.md): tdesktop `history_inner_widget.cpp`,
 * `history_item_text.cpp`, `history_view_top_bar_widget.cpp`.
 */

import { canRetract, canStop, pollOfMessage } from './poll-parts.js';
import { canStopLive } from './live-place.js';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { networkMessageId } from './chat-model.js';
import { gifIdOf } from './gif-id.js';
import { isSongMessage } from './chat-music-save.js';
import { hasReaders, hasReactors } from './chat-readers.js';
import { hasReadTime } from './chat-read-time.js';
import { hasGameScores } from './chat-games.js';
import { hasTranslation } from './chat-translate.js';
import { useT } from './i18n.js';
import { noForwardsIn } from './chat-settings.js';

const el = React.createElement;

// Desktop selects at most this many (MaxSelectedItems).
export const MAX_SELECTED = 100;
// Telegram lets a message be edited for two days (edit_time_limit).
const EDIT_LIMIT_MS = 48 * 60 * 60_000;
// A reply's quoted text in a copy is cut at this many characters.
const REPLY_PREVIEW_MAX = 64;

export const isMine = (message) =>
  message?.sender === 'me' || message?.outgoing === true;

const timeOf = (message) => Date.parse(message?.timestamp ?? '') || null;

export const canEdit = (message, now) => {
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

/**
 * Whether the message may not be forwarded, copied or saved (R-Y165): it
 * carries Telegram's `noforwards`, or it is another's in a chat whose
 * creator restricted saving content.
 */
export const isProtected = (message, chat, info) =>
  Boolean(message?.raw?.noforwards) ||
  (!isMine(message) && noForwardsIn(chat, info));

// The items that put a protected message's content elsewhere.
const LEAVES = new Set([
  'forward',
  'copy',
  'copySelected',
  'saveAs',
  'copyImage',
  'saveMessageGif',
  'saveMessageMusic',
]);

/**
 * Whether the menu offers "Report" on `message` (R-Y175): another's sent
 * message in a group or channel.
 */
export const canReport = (message, chat = {}) =>
  message?.source === 'telegram' &&
  chat.personal !== true &&
  !isMine(message) &&
  !message.pending &&
  !message.service &&
  networkMessageId(message) !== null;

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

// A poll's own: Retract vote, Stop poll (its author), as Desktop has.
const pollItems = (message) => {
  const poll = pollOfMessage(message);
  return poll
    ? [canRetract(poll) && 'retractVote', canStop(poll, message) && 'stopPoll']
    : [];
};

/**
 * The part of the message's text that `selectedText` quotes, when it is
 * a part of it (Telegram takes only exact quotes), else null.
 */
export const quoteOf = (message, selectedText) => {
  const quote = String(selectedText ?? '').trim();
  return quote && String(message?.body ?? '').includes(quote) ? quote : null;
};

// Copy Message Link in a group, Copy Post Link in a channel; Copy Link
// when the pointer is on a link.
const linkItem = ({ message, chat, info, target }) => {
  if (target.url) {
    return 'copyUrl';
  }
  if (!messageLink(message, { chat: chat.chat, username: info?.username })) {
    return null;
  }
  return chat.kind === 'channel' ? 'copyPostLink' : 'copyLink';
};

// What the photo or sticker under the pointer offers.
const mediaItems = (target, sent) => {
  if (target.photo) {
    return sent ? ['saveAs', 'copyImage'] : [];
  }
  return target.sticker && sent ? ['saveAs'] : [];
};

// "Save GIF" on a GIF of Telegram, "Remove from GIFs" when it is saved
// (R-Y171); `gifs` the Set of saved ids.
const gifItem = (message, gifs) => {
  const id = message.source === 'telegram' ? gifIdOf(message) : null;
  if (!id) {
    return null;
  }
  return gifs?.has(id) ? 'unsaveMessageGif' : 'saveMessageGif';
};

// A game's high scores (R-Y190).
const gameItems = (message) => (hasGameScores(message) ? ['gameScores'] : []);

// The menu with nothing selected.
const singleItems = ({
  message,
  chat,
  info,
  selectedText,
  target,
  now,
  gifs,
}) => {
  const sent = !message.pending;
  if (!sent) {
    return [message.body ? 'copy' : null, 'delete'];
  }
  const quote = quoteOf(message, selectedText);
  const where = { personal: chat.personal, info };
  const copy = selectedText ? null : !target.photo && message.body && 'copy';
  return [
    quote ? 'quoteReply' : 'reply',
    selectedText ? 'copySelected' : null,
    canEdit(message, now) && 'edit',
    pinItem(message, where),
    ...pollItems(message),
    ...gameItems(message),
    canStopLive(message) && 'stopLive',
    ...mediaItems(target, sent),
    gifItem(message, gifs),
    isSongMessage(message) && 'saveMessageMusic',
    copy,
    linkItem({ message, chat, info, target }),
    hasTranslation(message) && 'translate',
    'forward',
    'delete',
    canReport(message, chat) && 'report',
    ...whoItems(message, chat),
    'select',
    // "Read at 14:05", a line, not an action (R-Y189).
    hasReadTime(message, chat, info) && 'readTime',
  ];
};

// Who read it and who reacted (R-Y127).
const whoItems = (message, chat) => [
  hasReaders(message, chat) && 'readers',
  hasReactors(message) && 'reactors',
];

// The menu while messages are selected: on one of them, what the
// selection offers; on another, Select and Select up to this message.
const selectedItems = (message, selection, order) => {
  const sent = !message.pending;
  if (selection.has(message.id)) {
    return [
      sent && 'reply',
      selection.canCopy !== false && 'copySelectedItems',
      selection.canForward && 'forwardSelected',
      'deleteSelected',
      selection.canReport && 'reportSelected',
      selection.anyPinned && 'unpinSelected',
      'clearSelection',
    ].filter(Boolean);
  }
  return [
    sent && 'reply',
    sent && 'select',
    sent && bulkSelect(selection.ids, message.id, order) && 'selectBulk',
  ].filter(Boolean);
};

/**
 * The menu's items for `message`, in Desktop's order. `chat` is the open
 * chat ({ chat, personal, kind }), `info` its chat info ({ username,
 * canPin }), `selectedText` what is selected inside the bubble, `target`
 * what the pointer is on ({ url, photo, sticker }), `selection` the
 * selected messages ({ ids, has(id), canForward, anyPinned }), `order`
 * the ids shown.
 */
export const menuItems = ({
  message,
  chat = {},
  info = null,
  selectedText = '',
  target = {},
  selection = null,
  order = [],
  now = Date.now(),
  gifs = null,
}) => {
  if ((selection?.ids?.length ?? 0) > 0) {
    return selectedItems(message, selection, order);
  }
  const locked = isProtected(message, chat, info);
  return singleItems({
    message,
    chat,
    info,
    selectedText,
    target,
    now,
    gifs,
  }).filter((key) => key && !(locked && LEAVES.has(key)));
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

/** The ids in `order` from `from` to `to`, both in; [] if either is not. */
export const rangeOf = (order, from, to) => {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  return a === -1 || b === -1
    ? []
    : order.slice(Math.min(a, b), Math.max(a, b) + 1);
};

/**
 * "Select up to this message": the selection with every message from the
 * nearest selected one to `id` added, or null when that would pass
 * MAX_SELECTED (Desktop then does not offer it).
 */
export const bulkSelect = (ids, id, order) => {
  const at = order.indexOf(id);
  if (at === -1 || ids.includes(id)) {
    return null;
  }
  let nearest = null;
  for (const one of ids) {
    const where = order.indexOf(one);
    if (
      where !== -1 &&
      (nearest === null || Math.abs(where - at) < Math.abs(nearest - at))
    ) {
      nearest = where;
    }
  }
  if (nearest === null) {
    return null;
  }
  const range = rangeOf(order, order[nearest], id);
  const next = [...ids, ...range.filter((one) => !ids.includes(one))];
  return next.length > MAX_SELECTED ? null : next;
};

/**
 * The selection after a drag over `range`: added (at most MAX_SELECTED
 * in all) or, when the drag began on a selected message, taken away.
 */
export const applyDrag = (ids, range, adding) => {
  if (!adding) {
    const drop = new Set(range);
    return ids.filter((one) => !drop.has(one));
  }
  const next = [...ids];
  for (const one of range) {
    if (next.length >= MAX_SELECTED) {
      break;
    }
    if (!next.includes(one)) {
      next.push(one);
    }
  }
  return next;
};

/**
 * Date and time as Desktop's copies show them (the locale's short form):
 * "10/21/26 3:21 PM", "21.10.2026 15:21".
 */
export const copyStamp = (message, locale = undefined) => {
  const at = timeOf(message);
  if (at === null) {
    return '';
  }
  const when = new Date(at);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'short' });
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' });
  return `${date.format(when)} ${time.format(when)}`;
};

const oneLine = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const cut = (text) => {
  const line = oneLine(text);
  return line.length > REPLY_PREVIEW_MAX
    ? `${line.slice(0, REPLY_PREVIEW_MAX).trim()}…`
    : line;
};

// One message's text in a copy: "[ Photo ]" and its caption a blank
// line apart, as Desktop puts them.
const bodyOf = ({ text, media }) => {
  const label = media ? `[ ${media} ]` : '';
  return [label, String(text ?? '')].filter(Boolean).join('\n\n');
};

// "[date time] Name:", " in reply to Who" before the colon, the quoted
// line under it.
const entryText = (part, stamp) => {
  const body = bodyOf(part);
  const reply = part.reply?.name ? part.reply : null;
  const head = `[${stamp}] ${part.author}${reply ? ` ${reply.label}` : ''}:`;
  if (reply?.text) {
    return `${head}\n> ${cut(reply.text)}${body ? `\n${body}` : ''}`;
  }
  return `${head} ${body}`;
};

/**
 * The text Copy puts on the clipboard. One message: its text. Several,
 * in time order, a line each: "[date time] Name: text", with "in reply
 * to Who" and the quoted line when it replies. `describe(message)` says
 * `{ author, text, media, reply: { name, label, text } }`; `stamp`
 * formats a message's time.
 */
export const selectionText = (
  messages,
  { describe = defaultDescribe, stamp = copyStamp } = {}
) => {
  const sorted = [...messages]
    .filter(Boolean)
    .sort(
      (a, b) =>
        (timeOf(a) ?? 0) - (timeOf(b) ?? 0) ||
        (networkMessageId(a) ?? 0) - (networkMessageId(b) ?? 0)
    );
  if (sorted.length === 1) {
    return bodyOf({ ...describe(sorted[0]), media: null }) || '';
  }
  return sorted
    .map((message) => entryText(describe(message), stamp(message)))
    .join('\n');
};

const defaultDescribe = (message) => ({
  author: isMine(message) ? 'You' : (message.senderName ?? message.sender),
  text: message.body ?? '',
  media: null,
  reply: null,
});

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
 * The open chat's selection: `{ active, ids, has(id), shows(id),
 * toggle(id, { shift, order }), add(id), set(ids), drag(range, adding),
 * dropDrag(), endDrag(), clear() }`. `shows` is what a row looks like
 * while a drag goes on. It ends when the chat changes.
 */
export const useSelection = (chatKey) => {
  const [state, setState] = useState({ ids: [], anchor: null, drag: null });
  useEffect(() => setState({ ids: [], anchor: null, drag: null }), [chatKey]);
  const toggle = useCallback(
    (id, options) =>
      setState((before) => ({
        ...toggleSelected(before, id, options),
        drag: null,
      })),
    []
  );
  const add = useCallback(
    (id) =>
      setState((before) => ({
        ids: applyDrag(before.ids, [id], true),
        anchor: id,
        drag: null,
      })),
    []
  );
  const set = useCallback(
    (ids) => setState({ ids, anchor: ids.at(-1) ?? null, drag: null }),
    []
  );
  const drag = useCallback(
    (range, adding) =>
      setState((before) => ({ ...before, drag: { range, adding } })),
    []
  );
  const dropDrag = useCallback(
    () => setState((before) => ({ ...before, drag: null })),
    []
  );
  const endDrag = useCallback(
    () =>
      setState((before) =>
        before.drag
          ? {
              ids: applyDrag(before.ids, before.drag.range, before.drag.adding),
              anchor: before.drag.range.at(-1) ?? before.anchor,
              drag: null,
            }
          : before
      ),
    []
  );
  const clear = useCallback(
    () => setState({ ids: [], anchor: null, drag: null }),
    []
  );
  return useMemo(() => {
    const held = new Set(state.ids);
    const shown = state.drag
      ? new Set(applyDrag(state.ids, state.drag.range, state.drag.adding))
      : held;
    return {
      active: shown.size > 0,
      dragging: state.drag !== null,
      ids: state.ids,
      has: (id) => held.has(id),
      shows: (id) => shown.has(id),
      toggle,
      add,
      set,
      drag,
      dropDrag,
      endDrag,
      clear,
    };
  }, [state, toggle, add, set, drag, dropDrag, endDrag, clear]);
};

const isTyping = (target) =>
  Boolean(target?.closest?.('input, textarea, [contenteditable="true"]'));

// A menu or dialog is open over the chat.
const overlayOpen = () =>
  Boolean(
    globalThis.document?.querySelector?.('[role="menu"], [role="dialog"]')
  );

/**
 * Selection keys, as in Desktop: Esc clears, Ctrl/Cmd+C copies (unless
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
      // An open menu or dialog takes the keys: Esc closes only it.
      if (event.defaultPrevented || overlayOpen()) {
        return;
      }
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

// A top-bar button: its label in capitals and, after it, the count.
const TopButton = ({ action, label, count, onClick, filled = true }) =>
  el(
    'button',
    {
      type: 'button',
      className: filled ? 'selection-top-button' : 'selection-top-cancel',
      'data-action': action,
      onClick,
    },
    [
      el('span', { key: 'l' }, label),
      count
        ? el('span', { key: 'n', className: 'selection-top-count' }, count)
        : null,
    ]
  );

/**
 * The chat's top bar while messages are selected, as Desktop's: FORWARD
 * n (when all of them can be forwarded), DELETE n and — when all are
 * others' in a group or channel — REPORT n (R-Y175) on the left, CANCEL
 * on the right.
 */
export const SelectionTop = ({
  count,
  canForward = true,
  canReport = false,
  onClear,
  onForward,
  onDelete,
  onReport,
}) => {
  const t = useT();
  return el(
    'header',
    { className: 'chat-header selection-top', role: 'toolbar' },
    [
      canForward
        ? el(TopButton, {
            key: 'f',
            action: 'forward',
            label: t('chat.selection.forward'),
            count,
            onClick: onForward,
          })
        : null,
      el(TopButton, {
        key: 'd',
        action: 'delete',
        label: t('chat.selection.delete'),
        count,
        onClick: onDelete,
      }),
      canReport
        ? el(TopButton, {
            key: 'r',
            action: 'report',
            label: t('chat.selection.report'),
            count,
            onClick: onReport,
          })
        : null,
      el('span', { key: 'gap', className: 'selection-top-gap' }),
      el(TopButton, {
        key: 'c',
        action: 'clear',
        label: t('chat.selection.cancel'),
        onClick: onClear,
        filled: false,
      }),
    ]
  );
};
