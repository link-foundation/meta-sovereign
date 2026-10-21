// The chat list's menu, as Telegram's apps have it (R-Y97; Telegram
// Desktop's dialogs menu, learned, never copied): a right-click on a
// chat offers to pin or unpin it, mute it (for an hour, 8 hours, 2 days
// or for good) or unmute it, mark it read or unread, archive it or bring
// it back. Telegram does each one; the list follows its answer. A chat
// marked unread loses the mark when it is opened, as in Desktop.

import React, { useEffect, useRef, useState } from 'react';
import { MsgContextMenu } from './chat-message.js';

const el = React.createElement;

// Mute for: an hour, 8 hours, 2 days, or for good (no time).
export const MUTE_FOR = Object.freeze({
  mute1h: 3600,
  mute8h: 8 * 3600,
  mute2d: 2 * 24 * 3600,
  muteForever: 0,
});

/** The menu's items for a chat, in Desktop's order; none off Telegram. */
export const chatMenuItems = (chat, { telegramUser = true } = {}) => {
  if (chat?.source !== 'telegram' || !telegramUser) {
    return [];
  }
  return [
    chat.pinned > 0 ? 'unpinChat' : 'pinChat',
    chat.muted ? 'unmute' : 'mute',
    chat.unread > 0 || chat.marked ? 'markRead' : 'markUnread',
    chat.archived ? 'unarchive' : 'archive',
  ];
};

// What each item asks Telegram: [action, seconds].
const ASK = {
  pinChat: ['pin'],
  unpinChat: ['unpin'],
  unmute: ['unmute'],
  markRead: ['read'],
  markUnread: ['unread'],
  archive: ['archive'],
  unarchive: ['unarchive'],
  ...Object.fromEntries(
    Object.entries(MUTE_FOR).map(([key, seconds]) => [key, ['mute', seconds]])
  ),
};

/** The request an item makes, or null (`mute` opens the times). */
export const chatMenuRequest = (key, chat) => {
  const ask = ASK[key];
  return ask && chat?.chat
    ? { chat: String(chat.chat), action: ask[0], for: ask[1] ?? 0 }
    : null;
};

/**
 * `{ menu, open(chat, point) }`: the open menu (or null), and what a
 * row's right-click calls. Failures go to `state.notify`, as the
 * messages' menu's do.
 */
export const useChatListMenu = ({ state, api }) => {
  const [open, setOpen] = useState(null);
  const telegramUser = state.telegram?.kind !== 'bot';
  const ask = async (request) => {
    if (!request || typeof api?.telegramDialog !== 'function') {
      return;
    }
    const answer = await api.telegramDialog(request);
    if (answer?.error) {
      state.notify?.({ kind: 'action-failed', error: answer.error });
    }
  };
  const latest = useRef(null);
  latest.current = (chat, point) => {
    const items = chatMenuItems(chat, { telegramUser });
    if (items.length > 0) {
      setOpen({ chat, point, items });
    }
  };
  // One function for every render, so the list's rows stay as they are.
  const [onMenu] = useState(() => (chat, point) => latest.current(chat, point));
  const onAction = (key, chat) => {
    if (key === 'mute') {
      // The times, where the menu was.
      setOpen({ chat, point: open.point, items: Object.keys(MUTE_FOR) });
      return;
    }
    ask(chatMenuRequest(key, chat));
  };
  const menu = open
    ? el(MsgContextMenu, {
        key: open.items.join(),
        x: open.point.x,
        y: open.point.y,
        message: open.chat,
        items: open.items,
        reactions: false,
        onClose: () => setOpen(null),
        onAction,
      })
    : null;
  useUnmarkOnOpen(state.current, ask);
  return { menu, onMenu };
};

// Opening a chat marked unread takes the mark off (Desktop does).
const useUnmarkOnOpen = (current, ask) => {
  const done = useRef(null);
  const key = current?.marked ? current.key : null;
  useEffect(() => {
    if (key && done.current !== key) {
      done.current = key;
      ask({ chat: String(current.chat), action: 'unmark', for: 0 });
    }
    if (!key) {
      done.current = null;
    }
    // `ask` is new each render; the chat's key decides.
  }, [key]);
};
