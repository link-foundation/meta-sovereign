// Keyboard shortcuts of the Chat screen, as Telegram Desktop has them
// (R-Y183; learned from its public help, never copied): the previous and
// next chat, the previous and next unread chat, the folders, the search in
// the list, and a dialog that lists them. Every shortcut here is a Ctrl /
// Cmd / Alt chord, so none of them types into a field; a plain key is never
// taken from a field. Searching in a chat (Ctrl+F), editing the last message
// (Up), replying up and down (Ctrl+Up / Ctrl+Down), the formatting keys and
// Esc in a dialog are handled where they belong (chat-search.js,
// chat-actions.js, text-shortcuts.js); this file only lists them.

import React, { useEffect, useRef } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { FormDialog } from './chat-create.js';

const el = React.createElement;

// Alt + Up / Down (with Shift: unread chats only).
const altChord = ({ key, shiftKey }) => {
  const dir = key === 'ArrowUp' ? 'prev' : key === 'ArrowDown' ? 'next' : null;
  return dir && (shiftKey ? `${dir}-unread` : `${dir}-chat`);
};

// Ctrl / Cmd + a plain key, without Alt.
const modChord = ({ key, shiftKey }) => {
  if (shiftKey) {
    return String(key).toLowerCase() === 'f' ? 'search-list' : null;
  }
  if (/^[0-9]$/.test(key)) {
    return key === '0' ? 'saved' : `folder-${key}`;
  }
  return key === '/' ? 'help' : null;
};

/** The action a key press asks for, or null. */
export const shortcutOf = (event) => {
  if (!event || event.isComposing) {
    return null;
  }
  const { key, ctrlKey, metaKey, altKey, shiftKey } = event;
  if (altKey) {
    return ctrlKey || metaKey ? null : altChord(event);
  }
  if (ctrlKey && !metaKey && key === 'Tab') {
    return shiftKey ? 'prev-chat' : 'next-chat';
  }
  return ctrlKey || metaKey ? modChord(event) : null;
};

/** The chat `step` places from the current one, wrapping round; null if none. */
export const neighbour = (chats = [], current, step) => {
  if (chats.length === 0) {
    return null;
  }
  const at = chats.findIndex((c) => c.key === current?.key);
  if (at === -1) {
    return step > 0 ? chats[0] : chats.at(-1);
  }
  return chats[(at + step + chats.length) % chats.length];
};

const isUnread = (c) => (c.unread > 0 || c.marked) && !c.muted;

/** The next (or previous) chat with something unread; null if none other. */
export const unreadNeighbour = (chats = [], current, step) => {
  const n = chats.length;
  const at = chats.findIndex((c) => c.key === current?.key);
  const start = at === -1 ? (step > 0 ? -1 : 0) : at;
  for (let i = 1; i <= n; i += 1) {
    const c = chats[(((start + step * i) % n) + n) % n];
    if (c.key !== current?.key && isUnread(c)) {
      return c;
    }
  }
  return null;
};

/** The chat of Saved Messages among `chats`, for the account `selfId`. */
export const savedChat = (chats = [], selfId) =>
  selfId === undefined || selfId === null
    ? null
    : (chats.find(
        (c) => c.source === 'telegram' && c.chat === String(selfId)
      ) ?? null);

const modalOpen = () =>
  Boolean(
    globalThis.document?.querySelector('[role="dialog"][aria-modal="true"]')
  );

/** What a shortcut does, given the chat state `s` (see ChatScreen). */
export const runShortcut = (name, s) => {
  const go = (chat) => chat && s.select(chat.key);
  if (name === 'prev-chat' || name === 'next-chat') {
    go(neighbour(s.chats, s.current, name === 'next-chat' ? 1 : -1));
  } else if (name === 'prev-unread' || name === 'next-unread') {
    go(unreadNeighbour(s.chats, s.current, name === 'next-unread' ? 1 : -1));
  } else if (name === 'saved') {
    go(savedChat(s.chats, s.selfId));
  } else if (name.startsWith('folder-')) {
    const tab = s.tabs?.[Number(name.slice(7)) - 1];
    if (tab) {
      s.setFilter(tab.key);
    }
  } else if (name === 'search-list') {
    s.focusSearch();
  } else if (name === 'help') {
    s.openHelp();
  }
};

/** Installs the shortcuts while the Chat screen is shown. */
export const useChatShortcuts = (state) => {
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const onKey = (event) => {
      if (latest.current.enabled === false) {
        return;
      }
      const name = shortcutOf(event);
      // A box on top (delete, forward, ...) keeps the keys to itself.
      if (!name || (name !== 'help' && modalOpen())) {
        return;
      }
      event.preventDefault();
      runShortcut(name, latest.current);
    };
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
};

/** Focuses the list's search box (the global search is typed there). */
export const focusListSearch = () => {
  const box = globalThis.document?.querySelector('.chat-search');
  box?.focus();
  box?.select?.();
};

const MOD = 'Ctrl';
/** The dialog's rows: [group, [[keys, label key], ...]]. */
export const SHORTCUT_GROUPS = Object.freeze([
  [
    'shortcuts.group.chats',
    [
      [['Alt', '↑'], 'shortcuts.prevChat'],
      [['Alt', '↓'], 'shortcuts.nextChat'],
      [[MOD, 'Tab'], 'shortcuts.nextChat'],
      [[MOD, 'Shift', 'Tab'], 'shortcuts.prevChat'],
      [['Alt', 'Shift', '↑'], 'shortcuts.prevUnread'],
      [['Alt', 'Shift', '↓'], 'shortcuts.nextUnread'],
      [[`${MOD}`, '1…9'], 'shortcuts.folder'],
      [[MOD, '0'], 'shortcuts.saved'],
    ],
  ],
  [
    'shortcuts.group.search',
    [
      [[MOD, 'F'], 'shortcuts.findInChat'],
      [[MOD, 'Shift', 'F'], 'shortcuts.searchAll'],
      [['Esc'], 'shortcuts.close'],
    ],
  ],
  [
    'shortcuts.group.messages',
    [
      [['↑'], 'shortcuts.editLast'],
      [[MOD, '↑ / ↓'], 'shortcuts.reply'],
      [[MOD, 'B / I / U'], 'shortcuts.format'],
    ],
  ],
  [
    'shortcuts.group.app',
    [
      [[MOD, 'L'], 'shortcuts.lock'],
      [[MOD, '/'], 'shortcuts.help'],
    ],
  ],
]);

const Keys = ({ keys }) =>
  el(
    'span',
    { className: 'shortcut-keys' },
    keys.map((k, i) => el('kbd', { key: i }, k))
  );

/** The dialog that lists the shortcuts. */
export const ShortcutsDialog = ({ close }) => {
  const t = useT();
  return el(
    FormDialog,
    {
      name: 'shortcuts',
      title: t('shortcuts.title'),
      onClose: close,
      onSubmit: close,
      submit: t('chat.privacy.done'),
      busy: false,
      error: null,
      outside: true,
    },
    SHORTCUT_GROUPS.map(([group, rows]) =>
      el('section', { key: group, className: 'shortcut-group' }, [
        el('h4', { key: 'h' }, t(group)),
        ...rows.map(([keys, label], i) =>
          el('div', { key: i, className: 'shortcut-row' }, [
            el('span', { key: 'l' }, t(label)),
            el(Keys, { key: 'k', keys }),
          ])
        ),
      ])
    )
  );
};

/** The list's keyboard button. */
export const ShortcutsButton = ({ onOpen }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: 'icon-btn',
      'data-action': 'shortcuts-help',
      'aria-label': t('shortcuts.title'),
      title: t('shortcuts.title'),
      onClick: onOpen,
    },
    el(Icon, { name: 'keyboard', size: 18 })
  );
};

/** The list's dialog, while `open`. */
export const ShortcutsHost = ({ open, close }) =>
  open ? el(ShortcutsDialog, { close }) : null;
