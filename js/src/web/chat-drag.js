/**
 * Selecting messages with the mouse, as Telegram Desktop does (R-Y68,
 * learned from `history_inner_widget.cpp`, never copied): press on a
 * message and drag to another, and every message between is selected
 * (taken away, when the drag began on a selected one). With nothing
 * selected, a press on the text selects text until the pointer leaves
 * the message; then it selects messages. A press beside a bubble selects
 * its message once the pointer moves a few pixels, as one with some
 * selected does (R-Y83). Rows meet edge to edge, as Desktop's do: a
 * press in the gap between two bubbles, or beside the column on a wide
 * window, is on the row at that height. Near the list's top or bottom
 * the list scrolls on. At most 100 are selected.
 */

import { useRef } from 'react';
import { rangeOf } from './chat-selection.js';
import { debugBrowser } from './client-log.js';

// Desktop starts a drag after this many pixels (startDragDistance).
const DRAG_START_PX = 4;
// Within this far of the list's edge the list scrolls, up to SCROLL_MAX
// pixels a frame.
const SCROLL_EDGE_PX = 48;
const SCROLL_MAX_PX = 24;

const PRESS_SKIP = 'a, button, input, textarea, video, audio';

// Rows sit this far apart at most (the column's gap).
const ROW_GAP_PX = 8;

const rowUnder = (x, y) =>
  globalThis.document?.elementFromPoint?.(x, y)?.closest?.('[data-row]') ??
  null;

/**
 * The message row at (x, y): the one under the point, else the one at
 * that height (beside the column, or in the gap between two rows).
 * `column` is the element holding the rows.
 */
export const rowAt = (x, y, column = null) => {
  const under = rowUnder(x, y);
  const box = column?.getBoundingClientRect?.();
  if (under || !box || y < box.top || y > box.bottom) {
    return under;
  }
  const middle = box.left + box.width / 2;
  for (const dy of [0, -ROW_GAP_PX / 2, ROW_GAP_PX / 2, -ROW_GAP_PX]) {
    const row = rowUnder(middle, y + dy);
    if (row) {
      return row;
    }
  }
  return null;
};

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
 * `over` starts selecting messages: with some selected, or when it began
 * beside the bubble (`beside`), after a few pixels; else once it is over
 * another message.
 */
export const dragStarts = ({
  selecting,
  beside = false,
  dx,
  dy,
  from,
  over,
}) =>
  selecting || beside
    ? Math.abs(dx) + Math.abs(dy) >= DRAG_START_PX
    : Boolean(over) && over !== from;

// The click that ends a drag must not also pick the row it ends on.
const swallowNextClick = () => {
  const stop = (event) => {
    debugBrowser('drag-click-suppressed', {
      x: event.clientX,
      y: event.clientY,
    });
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

// The row a press or click at the event's point is on.
const rowOf = (event, column) =>
  event.target?.closest?.('[data-row]') ??
  rowAt(event.clientX, event.clientY, column);

// Whether the press is on the row but not on its bubble (or avatar).
const besideBubble = (event, row) =>
  !event.target?.closest?.('.bubble, .msg-avatar') &&
  !row.querySelector('.bubble')?.contains(event.target);

/**
 * `{ onMouseDown, onClick }` for the scrolling list. `box` is the list,
 * `column` the element holding the rows, `selection`
 * ./chat-selection.js `useSelection`, `order()` the ids shown. While
 * messages are selected a click beside every row (in a gap, or beside
 * the column) picks or drops the row at that height.
 */
export const useDragSelect = ({ box, column, selection, order }) => {
  const latest = useRef({ selection, order });
  latest.current = { selection, order };

  const onClick = (event) => {
    const now = latest.current;
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      Boolean(globalThis.getSelection?.()?.toString?.()) ||
      event.target?.closest?.('[data-row], [role="menu"], a, button, input')
    ) {
      return;
    }
    const row = rowAt(event.clientX, event.clientY, column?.current);
    if (row) {
      event.preventDefault();
      now.selection.toggle(row.dataset.row, {
        shift: event.shiftKey,
        order: now.order(),
      });
    }
  };

  // A press on the list's scrollbar scrolls; it selects nothing.
  const onScrollbar = (event) => {
    const node = box.current;
    return (
      event.target === node &&
      event.clientX - node.getBoundingClientRect().left >= node.clientWidth
    );
  };

  const begin = (event) => {
    const row = onScrollbar(event) ? null : rowOf(event, column?.current);
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
      beside: besideBubble(event, row),
      dragging: false,
      adding: true,
      frame: null,
    };
    debugBrowser('drag-press', { x: press.x, y: press.y, from: press.from });

    const update = () => {
      const over =
        rowAt(press.lastX, press.lastY, column?.current)?.dataset.row ?? null;
      const { selection: chosen } = latest.current;
      if (!press.dragging) {
        if (
          !dragStarts({
            selecting: chosen.active,
            beside: press.beside,
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
      debugBrowser('drag-release', { dragging: press.dragging });
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

  const onContextMenu = (event) => {
    if (
      event.target?.closest?.('[data-row], [role="menu"], a, button, input')
    ) {
      return;
    }
    const row = rowAt(event.clientX, event.clientY, column?.current);
    if (!row) {
      return;
    }
    event.preventDefault();
    row.dispatchEvent(
      new globalThis.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: event.clientX,
        clientY: event.clientY,
      })
    );
  };
  return { onMouseDown: begin, onClick, onContextMenu };
};
