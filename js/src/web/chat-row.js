// A message row's ways in (Telegram Desktop's `HistoryInner`, learned,
// never copied): where its menu opens, what a right-click, a double-click,
// a long press or a swipe does, and a click while messages are selected.

import { useRef } from 'react';
import { selectedTextIn } from './chat-selection.js';
import { useTouchGestures } from './chat-gestures.js';

// The menu opens where the pointer is; from the keyboard (the menu key,
// Shift+F10) the event has no point, so at the bubble's corner.
const menuPoint = (event, node) => {
  if (event.clientX || event.clientY) {
    return { x: event.clientX, y: event.clientY };
  }
  const r = node?.getBoundingClientRect?.();
  return r ? { x: r.left, y: r.bottom } : { x: 0, y: 0 };
};

// Double-click replies (Telegram Desktop): the word it selected is let go.
const dropTextSelection = () =>
  globalThis.getSelection?.()?.removeAllRanges?.();

// What the pointer is on: a link (its address), a photo, a sticker.
const albumItemOf = (node) =>
  node?.closest?.('[data-album-item]')?.dataset?.albumItem ?? null;

const targetOf = (node) => {
  const link = node?.closest?.('a[href]');
  const href = link?.getAttribute?.('href') ?? '';
  return {
    url: /^(https?:|mailto:|tg:)/i.test(href) ? link.href : null,
    photo: Boolean(node?.closest?.('.bubble-photo')),
    sticker: Boolean(node?.closest?.('.bubble-sticker')),
    // Which of an album's items (./chat-album.js).
    item: albumItemOf(node),
  };
};

/**
 * The row's ways in, as in Telegram Desktop: right-click (or a long
 * press) opens the menu where it happened, a double-click (or a swipe to
 * the left) replies, a double tap reacts with 👍; while messages are
 * selected a click anywhere on the row adds or takes the message
 * (Shift+click a range), a right-click anywhere opens the selection's
 * menu, and nothing inside the row opens. With none selected a click on
 * a message's time selects it, as a click on the date does in Desktop
 * and on the time in Telegram for macOS (R-Y83).
 */
export const useRowHandlers = ({
  row,
  bubble,
  message,
  usable,
  selecting,
  onSelect,
  onAction,
  setMenu,
  quickReaction,
}) => {
  const open = (point, node = null) => {
    setMenu({
      ...point,
      text: selectedTextIn(bubble.current),
      target: targetOf(node),
    });
  };
  const touch = useTouchGestures({
    rowRef: row,
    enabled: () => usable && !selecting,
    onLongPress: (point) => {
      dropTextSelection();
      open(point);
    },
    onSwipe: () => onAction('reply', message),
    onDoubleTap: () =>
      quickReaction && onAction('react', message, quickReaction),
  });
  // The text selected when the right button went down: Safari selects
  // the word under a right-click before the menu event, Telegram
  // selects nothing, so a word selected by that click is let go.
  const pressed = useRef(null);
  if (!usable) {
    return {};
  }
  if (selecting) {
    return {
      onClickCapture: (e) => {
        // The row's own menu takes its clicks.
        if (e.target.closest?.('[role="menu"]')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onSelect?.(message.id, { shift: e.shiftKey });
      },
      onContextMenu: (e) => {
        e.preventDefault();
        open(menuPoint(e, row.current));
      },
    };
  }
  return {
    ...touch,
    onClick: (e) => {
      if (
        e.button === 0 &&
        !message.pending &&
        e.target.closest?.('.bubble-time') &&
        !selectedTextIn(bubble.current)
      ) {
        e.preventDefault();
        onSelect?.(message.id, { shift: false });
      }
    },
    onMouseDown: (e) => {
      if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
        pressed.current = selectedTextIn(bubble.current);
      }
    },
    // Anywhere on the row, as in Desktop: beside the bubble too.
    onContextMenu: (e) => {
      if (e.target.closest?.('[role="menu"]')) {
        return;
      }
      e.preventDefault();
      if (pressed.current === '') {
        dropTextSelection();
      }
      pressed.current = null;
      const inside = Boolean(bubble.current?.contains(e.target));
      open(
        menuPoint(e, inside ? bubble.current : row.current),
        inside ? e.target : null
      );
    },
    onDoubleClick: (e) => {
      if (!bubble.current?.contains(e.target) || message.pending) {
        return;
      }
      if (e.target.closest?.('a, button, video, audio, input')) {
        return;
      }
      dropTextSelection();
      onAction('reply', message);
    },
  };
};
