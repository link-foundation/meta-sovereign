// Notifications of new messages, as Telegram Desktop gives them (R-Y134):
// a message that comes in to a chat that is not muted shows the system's
// notification — the chat's name, the sender and the text (or only "New
// message" when the user hides them) — unless that chat is open in a page
// the user is looking at. A click on it brings the page forward and opens
// the chat. The page's title carries the unread count, "(3) …", as
// Telegram's web apps show it in the tab. Each is a choice in Settings,
// kept in this browser.

import { useEffect, useRef, useState } from 'react';
import { chatPreview } from './chat-list.js';

// A message older than this when it first shows is history being read,
// not news.
export const FRESH_MS = 2 * 60_000;

export const NOTIFY_KEY = 'metaSovereignNotify';
export const NOTIFY_PREVIEW_KEY = 'metaSovereignNotifyPreview';
export const TITLE_COUNT_KEY = 'metaSovereignTitleCount';

/** A choice kept in localStorage as 'on' or 'off'; `fallback` otherwise. */
export const readPref = (key, fallback, storage = globalThis.localStorage) => {
  try {
    const kept = storage?.getItem(key);
    return kept === 'on' || (kept !== 'off' && fallback);
  } catch {
    return fallback;
  }
};

export const writePref = (key, on, storage = globalThis.localStorage) => {
  try {
    storage?.setItem(key, on ? 'on' : 'off');
  } catch {
    // Private mode: the choice lasts for this page only.
  }
};

export const usePref = (key, fallback) => {
  const [on, setOn] = useState(() => readPref(key, fallback));
  return [
    on,
    (next) => {
      writePref(key, next);
      setOn(next);
    },
  ];
};

const lastId = (chat) => chat.last?.message?.id ?? null;

/**
 * The chats whose newest message is news since `seen` (key -> the newest
 * message's id), and `seen` brought up to date. Nothing is news on the
 * first look (`seen` null): that is the list as it was.
 */
export const freshChats = (seen, chats, { now = Date.now(), open } = {}) => {
  const next = new Map();
  const fresh = [];
  for (const chat of chats) {
    const id = lastId(chat);
    next.set(chat.key, id);
    const at = Date.parse(chat.last?.at ?? '');
    if (
      seen &&
      id &&
      seen.get(chat.key) !== id &&
      !chat.last.mine &&
      !chat.muted &&
      chat.unread > 0 &&
      now - at < FRESH_MS &&
      chat.key !== open
    ) {
      fresh.push(chat);
    }
  }
  return { seen: next, fresh };
};

/** What a notification says of a chat's newest message. */
export const notificationOf = (t, chat, preview = true) => {
  if (!preview) {
    return { title: t('appName'), body: t('chat.notify.hidden') };
  }
  const { who, what } = chatPreview(t, chat);
  const text = what || t('chat.notify.message');
  return {
    title: chat.name,
    body: who ? `${who}: ${text}` : text,
  };
};

/** Unread messages in chats that are not muted, as the badge counts. */
export const unreadTotal = (chats) =>
  chats.reduce((sum, c) => sum + (c.muted ? 0 : Number(c.unread) || 0), 0);

export const titled = (base, count) =>
  count > 0 ? `(${count > 99 ? '99+' : count}) ${base}` : base;

const looking = () =>
  globalThis.document?.visibilityState !== 'hidden' &&
  globalThis.document?.hasFocus?.() !== false;

export const notifyAllowed = () =>
  typeof globalThis.Notification === 'function' &&
  globalThis.Notification.permission === 'granted';

// The page's title with the unread count, its own title kept.
const useTitleCount = (chats, on) => {
  const base = useRef(null);
  const count = on ? unreadTotal(chats) : 0;
  useEffect(() => {
    const doc = globalThis.document;
    if (!doc) {
      return;
    }
    base.current ??= doc.title;
    doc.title = titled(base.current, count);
  }, [count]);
  useEffect(
    () => () => {
      if (globalThis.document && base.current !== null) {
        globalThis.document.title = base.current;
      }
    },
    []
  );
};

/**
 * Shows a notification for each chat with news. `show({ source, chat })`
 * opens a chat; `current` is the open one.
 */
export const useNotifications = ({ chats, current, show, t }) => {
  const seen = useRef(null);
  const latest = useRef(show);
  latest.current = show;
  useTitleCount(chats, readPref(TITLE_COUNT_KEY, true));
  useEffect(() => {
    if (chats.length === 0) {
      return;
    }
    const open = looking() ? current?.key : null;
    const found = freshChats(seen.current, chats, { open });
    seen.current = found.seen;
    if (!readPref(NOTIFY_KEY, true) || !notifyAllowed()) {
      return;
    }
    const preview = readPref(NOTIFY_PREVIEW_KEY, true);
    for (const chat of found.fresh) {
      const { title, body } = notificationOf(t, chat, preview);
      try {
        const note = new globalThis.Notification(title, {
          body,
          tag: chat.key,
        });
        note.onclick = () => {
          globalThis.focus?.();
          latest.current({ source: chat.source, chat: chat.chat });
          note.close();
        };
      } catch {
        // A browser that shows notifications only from a service worker.
      }
    }
  }, [chats, current?.key]);
};
