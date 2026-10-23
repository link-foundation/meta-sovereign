/**
 * Reordering the pinned chats in the chat list (R-Y159; learned from
 * Telegram Desktop, never copied). The pinned chats sit on top in
 * Telegram's own order (their pinned rank, never their date). A pinned
 * chat is dragged to a new place (chat-pin-drag.js), or moved one place
 * with "Move up" / "Move down" in its context menu (the Menu key or
 * Shift+F10 opens it from the keyboard). The new order shows at once and
 * goes to Telegram (messages.reorderPinnedDialogs, folder 0 or the
 * Archive's 1); if Telegram refuses, the old order comes back with a
 * short notice. Unpinned chats cannot be dragged.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { beginPinGesture } from './chat-pin-drag.js';

// The optimistic order is dropped after this long even if the list never
// agreed with it.
const KEEP_MS = 10_000;

/** The keys of the pinned chats, in the order given. */
export const pinnedKeys = (chats = []) =>
  chats.filter((c) => c.pinned > 0).map((c) => c.key);

/** `keys` with the one at `from` moved to place `to`. */
export const moveKey = (keys, from, to) => {
  if (!keys[from] || to < 0 || to >= keys.length || from === to) {
    return keys;
  }
  const next = [...keys];
  const [one] = next.splice(from, 1);
  next.splice(to, 0, one);
  return next;
};

/** `chats` with the pinned ones in the order of `keys` (null: as is). */
export const applyOrder = (chats = [], keys = null) => {
  if (!keys) {
    return chats;
  }
  const pinned = chats.filter((c) => c.pinned > 0);
  const place = new Map(keys.map((key, at) => [key, at]));
  const rank = (c) => place.get(c.key) ?? keys.length;
  const sorted = [...pinned].sort((a, b) => rank(a) - rank(b));
  let next = 0;
  return chats.map((c) => (c.pinned > 0 ? sorted[next++] : c));
};

/** The request for `keys`: `{ folder, chats }`, or null when none. */
export const reorderRequest = (keys, chats, folder) => {
  const byKey = new Map(chats.map((c) => [c.key, c]));
  const ids = keys.map((key) => String(byKey.get(key)?.chat ?? ''));
  return ids.length > 0 && ids.every(Boolean)
    ? { folder: folder === 'archive' ? 1 : 0, chats: ids }
    : null;
};

const sameKeys = (a, b) =>
  a.length === b.length && a.every((key, at) => key === b[at]);

// Reordering is offered for the whole list of one folder, newest first,
// of a Telegram user account: no search, tab or sort hides some pinned.
const offered = (state) =>
  state.telegram?.kind === 'user' &&
  !state.query &&
  (state.sort ?? 'latest') === 'latest' &&
  state.filter === 'all' &&
  state.chats.some((c) => c.pinned > 1);

/**
 * `{ chats, position(chat), move(chat, delta), onPinDown }`: the chats to
 * show (the optimistic order applied), a pinned chat's `{ index, count }`
 * (null where reordering is not offered), a move by one place, and the
 * pointer-down handler of a pinned row.
 */
export const usePinnedOrder = ({ state, api }) => {
  const [keys, setKeys] = useState(null);
  const timer = useRef(0);
  const can = offered(state);
  const shown = useMemo(
    () => applyOrder(state.chats, keys),
    [state.chats, keys]
  );
  const real = pinnedKeys(state.chats);
  // Telegram's list agrees (or the pinned set changed): nothing to hold.
  useEffect(() => {
    if (keys && (!can || sameKeys(keys, real) || keys.length !== real.length)) {
      setKeys(null);
    }
  }, [keys, real.join(), can]);
  useEffect(() => () => globalThis.clearTimeout(timer.current), []);
  const now = pinnedKeys(shown);
  const latest = useRef(null);
  const nowRef = useRef(now);
  nowRef.current = now;
  latest.current = (next) => {
    const request = reorderRequest(next, shown, state.folder);
    if (!request || typeof api?.telegramPinnedReorder !== 'function') {
      return;
    }
    setKeys(next);
    globalThis.clearTimeout(timer.current);
    timer.current = globalThis.setTimeout(() => setKeys(null), KEEP_MS);
    Promise.resolve(api.telegramPinnedReorder(request)).then((answer) => {
      if (!answer || answer.error || answer.ok === false) {
        globalThis.clearTimeout(timer.current);
        setKeys(null);
        state.notify?.({ kind: 'pin-reorder-failed' });
      }
    });
  };
  const move = (chat, delta) => {
    const at = now.indexOf(chat.key);
    latest.current(moveKey(now, at, at + delta));
  };
  const [onPinDown] = useState(() => (e, chat) => {
    const index = nowRef.current.indexOf(chat.key);
    if (index < 0 || (e.pointerType === 'mouse' && e.button !== 0)) {
      return;
    }
    beginPinGesture(e, e.currentTarget, (from, to) =>
      latest.current(moveKey(nowRef.current, from, to))
    );
  });
  return {
    chats: shown,
    can,
    position: (chat) =>
      can && now.includes(chat.key)
        ? { index: now.indexOf(chat.key), count: now.length }
        : null,
    move,
    onPinDown: can ? onPinDown : undefined,
  };
};
