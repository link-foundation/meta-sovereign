/**
 * Selecting messages with the mouse, as Telegram Desktop does (R-Y68,
 * learned from `history_inner_widget.cpp`, never copied): press on a
 * message and drag to another, and every message between is selected
 * (taken away, when the drag began on a selected one). With nothing
 * selected, a press on the text selects text until the pointer leaves
 * the message; then it selects messages. While messages are selected a
 * drag starts once the pointer has moved a few pixels. Near the list's
 * top or bottom the list scrolls on. At most 100 are selected.
 */

import { useRef } from 'react';
import { rangeOf } from './chat-selection.js';

// Desktop starts a drag after this many pixels (startDragDistance).
const DRAG_START_PX = 4;
// Within this far of the list's edge the list scrolls, up to SCROLL_MAX
// pixels a frame.
const SCROLL_EDGE_PX = 48;
const SCROLL_MAX_PX = 24;

const PRESS_SKIP = 'a, button, input, textarea, video, audio';

// The message row at (x, y), if any.
const rowAt = (x, y) =>
  globalThis.document?.elementFromPoint?.(x, y)?.closest?.('[data-row]') ??
  null;

const dropTextSelection = () =>
  globalThis.getSelection?.()?.removeAllRanges?.();

// How far to scroll the box with the pointer at `y`: < 0 up, > 0 down.
export const edgeScroll = (y, top, bottom) => {
  if (y < top + SCROLL_EDGE_PX) {
    return -Math.ceil(
      (SCROLL_MAX_PX * Math.min(SCROLL_EDGE_PX, top + SCROLL_EDGE_PX - y)) /
        SCROLL_EDGE_PX
    );
  }
  if (y > bottom - SCROLL_EDGE_PX) {
    return Math.ceil(
      (SCROLL_MAX_PX *
        Math.min(SCROLL_EDGE_PX, y - (bottom - SCROLL_EDGE_PX))) /
        SCROLL_EDGE_PX
    );
  }
  return 0;
};

/**
 * Whether a press that moved (dx, dy) from `from` and is now over row
 * `over` starts selecting messages: with some selected after a few
 * pixels, else once it is over another message.
 */
export const dragStarts = ({ selecting, dx, dy, from, over }) =>
  selecting
    ? Math.abs(dx) + Math.abs(dy) >= DRAG_START_PX
    : Boolean(over) && over !== from;

// The click that ends a drag must not also pick the row it ends on.
const swallowNextClick = () => {
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  globalThis.addEventListener?.('click', stop, { capture: true, once: true });
  // A drag that ends outside a row sends no click: forget it soon.
  globalThis.setTimeout(
    () => globalThis.removeEventListener?.('click', stop, { capture: true }),
    0
  );
};

/**
 * `{ onMouseDown }` for the message column. `box` is the scrolling list,
 * `selection` ./chat-selection.js `useSelection`, `order()` the ids
 * shown.
 */
export const useDragSelect = ({ box, selection, order }) => {
  const latest = useRef({ selection, order });
  latest.current = { selection, order };

  const begin = (event) => {
    const row = event.target?.closest?.('[data-row]');
    const now = latest.current;
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !row ||
      event.target.closest('[role="menu"]') ||
      (!now.selection.active && event.target.closest(PRESS_SKIP))
    ) {
      return;
    }
    const press = {
      from: row.dataset.row,
      x: event.clientX,
      y: event.clientY,
      lastY: event.clientY,
      lastX: event.clientX,
      to: row.dataset.row,
      dragging: false,
      adding: true,
      frame: null,
    };

    const update = () => {
      const over = rowAt(press.lastX, press.lastY)?.dataset.row ?? null;
      const { selection: chosen } = latest.current;
      if (!press.dragging) {
        if (
          !dragStarts({
            selecting: chosen.active,
            dx: press.lastX - press.x,
            dy: press.lastY - press.y,
            from: press.from,
            over,
          })
        ) {
          return;
        }
        press.dragging = true;
        press.adding = !chosen.has(press.from);
      }
      dropTextSelection();
      press.to = over ?? press.to;
      chosen.drag(
        rangeOf(latest.current.order(), press.from, press.to),
        press.adding
      );
    };

    // Near an edge the list scrolls on, and the rows under the pointer
    // change: keep going while the button is down.
    const scrollOn = () => {
      press.frame = null;
      const node = box.current;
      if (!press.dragging || !node) {
        return;
      }
      const r = node.getBoundingClientRect();
      const step = edgeScroll(press.lastY, r.top, r.bottom);
      if (step !== 0) {
        node.scrollTop += step;
        update();
        press.frame = globalThis.requestAnimationFrame?.(scrollOn) ?? null;
      }
    };

    const move = (e) => {
      press.lastX = e.clientX;
      press.lastY = e.clientY;
      update();
      if (press.dragging) {
        e.preventDefault();
        if (press.frame === null) {
          press.frame = globalThis.requestAnimationFrame?.(scrollOn) ?? null;
        }
      }
    };

    const up = () => {
      globalThis.removeEventListener?.('mousemove', move);
      globalThis.removeEventListener?.('mouseup', up);
      if (press.frame !== null) {
        globalThis.cancelAnimationFrame?.(press.frame);
      }
      if (press.dragging) {
        latest.current.selection.endDrag();
        swallowNextClick();
      }
    };

    globalThis.addEventListener?.('mousemove', move);
    globalThis.addEventListener?.('mouseup', up);
  };

  return { onMouseDown: begin };
};
