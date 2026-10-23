/**
 * Dragging a pinned chat up or down among the pinned chats, as Telegram
 * Desktop lets the user (R-Y159; learned, never copied): press on a
 * pinned row and move the pointer a few pixels — a touch or a pen holds
 * for a moment first, so the list still scrolls — and the row lifts and
 * follows the pointer while the rows it passes slide aside, leaving a
 * gap where it would land. Letting go drops it there; Escape or a
 * cancelled pointer puts it back. Pointer events, so a mouse, a finger
 * and a pen all work.
 */

// Desktop starts a drag after this many pixels (startDragDistance).
const DRAG_START_PX = 4;
// A touch or a pen waits this long before it lifts a row.
const HOLD_MS = 350;
// A touch that moves this far before then is a scroll.
const SCROLL_PX = 10;

/**
 * Where a row lifted from place `from` would land when moved `dy` pixels:
 * the place whose rectangle holds the lifted row's middle (the nearest
 * one past the ends). `rects` are the pinned rows' rectangles, top first.
 */
export const dropIndex = (rects, from, dy) => {
  if (!rects[from]) {
    return from;
  }
  const middle = rects[from].top + dy + rects[from].height / 2;
  let best = 0;
  let distance = Infinity;
  rects.forEach((rect, at) => {
    const away = Math.abs(rect.top + rect.height / 2 - middle);
    if (away < distance) {
      best = at;
      distance = away;
    }
  });
  return best;
};

/** How far row `at` slides (in rows) while `from` is held over `to`. */
export const slideOf = (at, from, to) => {
  if (at === from) {
    return 0;
  }
  if (to > from && at > from && at <= to) {
    return -1;
  }
  return to < from && at >= to && at < from ? 1 : 0;
};

const setSlides = (rows, from, to, height) => {
  rows.forEach((row, at) => {
    if (at !== from) {
      row.style.transform = `translateY(${slideOf(at, from, to) * height}px)`;
    }
  });
};

const clearLook = (list, rows) => {
  list.classList.remove('is-pin-dragging');
  for (const row of rows) {
    row.classList.remove('is-lifted');
    row.style.transform = '';
    row.style.zIndex = '';
  }
};

// One gesture's state, the rows it moves and the list around them.
const gestureOf = (e, row) => {
  const list = row.closest('.chat-list');
  const rows = [...(list?.querySelectorAll('.chat-item[data-pinned]') ?? [])];
  const rects = rows.map((r) => r.getBoundingClientRect());
  const from = rows.indexOf(row);
  if (!list || rows.length < 2 || from < 0) {
    return null;
  }
  return {
    list,
    rows,
    rects,
    from,
    to: from,
    y0: e.clientY,
    x0: e.clientX,
    pointer: e.pointerId,
    touch: e.pointerType !== 'mouse',
    active: false,
    timer: 0,
  };
};

const lift = (g) => {
  g.active = true;
  g.list.classList.add('is-pin-dragging');
  g.rows[g.from].classList.add('is-lifted');
  g.rows[g.from].style.zIndex = '3';
  globalThis.getSelection?.()?.removeAllRanges?.();
};

const follow = (g, y) => {
  const first = g.rects[0].top - g.rects[g.from].top;
  const last = g.rects.at(-1).top - g.rects[g.from].top;
  const dy = Math.min(last, Math.max(first, y - g.y0));
  g.rows[g.from].style.transform = `translateY(${dy}px)`;
  g.to = dropIndex(g.rects, g.from, dy);
  setSlides(g.rows, g.from, g.to, g.rects[g.from].height);
};

/**
 * Starts the gesture a pointer-down on a pinned `row` may become.
 * `onDrop(from, to)` is called with the row's old and new place among the
 * pinned rows when it was moved. Returns nothing; the listeners remove
 * themselves when the gesture ends.
 */
export const beginPinGesture = (e, row, onDrop) => {
  const g = gestureOf(e, row);
  if (!g) {
    return;
  }
  const win = globalThis;
  const stop = (ev) => ev.preventDefault();
  const noClick = (ev) => ev.stopPropagation();
  const listeners = [];
  const on = (type, fn, options) => {
    win.addEventListener(type, fn, options);
    listeners.push([type, fn, options]);
  };
  const end = (drop) => {
    globalThis.clearTimeout(g.timer);
    for (const [type, fn, options] of listeners) {
      win.removeEventListener(type, fn, options);
    }
    const moved = g.active;
    clearLook(g.list, g.rows);
    if (g.touch) {
      win.setTimeout(
        () => win.removeEventListener('contextmenu', stop, true),
        400
      );
    }
    if (moved) {
      // The click that follows the drop is not a choice of the chat.
      win.addEventListener('click', noClick, true);
      win.setTimeout(() => win.removeEventListener('click', noClick, true), 60);
      if (drop && g.to !== g.from) {
        onDrop(g.from, g.to);
      }
    }
  };
  const move = (ev) => {
    if (ev.pointerId !== g.pointer) {
      return;
    }
    const far = Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0);
    if (!g.active && g.touch && far > SCROLL_PX) {
      end(false);
    } else if (!g.active && !g.touch && far >= DRAG_START_PX) {
      lift(g);
    }
    if (g.active) {
      follow(g, ev.clientY);
    }
  };
  on('pointermove', move);
  on('pointerup', (ev) => ev.pointerId === g.pointer && end(true));
  on('pointercancel', (ev) => ev.pointerId === g.pointer && end(false));
  on('keydown', (ev) => ev.key === 'Escape' && end(false));
  on('dragstart', stop, true);
  if (g.touch) {
    on('touchmove', (ev) => g.active && ev.cancelable && ev.preventDefault(), {
      passive: false,
    });
    win.addEventListener('contextmenu', stop, true);
    g.timer = win.setTimeout(() => {
      lift(g);
      follow(g, g.y0);
    }, HOLD_MS);
  }
};
