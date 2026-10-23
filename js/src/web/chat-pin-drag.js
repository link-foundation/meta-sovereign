/**
 * Dragging a pinned chat up or down among the pinned chats, as Telegram
 * Desktop lets the user (R-Y159; learned, never copied): press on a
 * pinned row and move the pointer a few pixels — a touch or a pen holds
 * for a moment first, so the list still scrolls — and the row lifts and
 * follows the pointer while the rows it passes slide aside, leaving a
 * gap where it would land. Letting go drops it there; Escape or a
 * cancelled pointer puts it back. Pointer events, so a mouse, a finger
 * and a pen all work.
 *
 * The same gesture reorders the folder tabs (sideways) and the rows of
 * Settings → Folders (R-Y172): `options` name the rows and the axis.
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
export const dropIndex = (rects, from, dy, axis = 'y') => {
  if (!rects[from]) {
    return from;
  }
  const [start, size] = axis === 'x' ? ['left', 'width'] : ['top', 'height'];
  const middle = rects[from][start] + dy + rects[from][size] / 2;
  let best = 0;
  let distance = Infinity;
  rects.forEach((rect, at) => {
    const away = Math.abs(rect[start] + rect[size] / 2 - middle);
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

const shift = (g, amount) => `translate${g.axis.toUpperCase()}(${amount}px)`;

const setSlides = (g) => {
  const size = g.rects[g.from][g.sizeKey];
  g.rows.forEach((row, at) => {
    if (at !== g.from) {
      row.style.transform = shift(g, slideOf(at, g.from, g.to) * size);
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
const PINNED = { list: '.chat-list', rows: '.chat-item[data-pinned]' };
const gestureOf = (e, row, { list: listSelector, rows: rowSelector, axis }) => {
  const list = row.closest(listSelector);
  const rows = [...(list?.querySelectorAll(rowSelector) ?? [])];
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
    axis,
    posKey: axis === 'x' ? 'left' : 'top',
    sizeKey: axis === 'x' ? 'width' : 'height',
    // Where the pointer began, along the axis (y0) and across it (x0).
    y0: axis === 'x' ? e.clientX : e.clientY,
    x0: axis === 'x' ? e.clientY : e.clientX,
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

// `y` is the pointer along the gesture's axis.
const follow = (g, y) => {
  const at = g.rects[g.from][g.posKey];
  const first = g.rects[0][g.posKey] - at;
  const last = g.rects.at(-1)[g.posKey] - at;
  const dy = Math.min(last, Math.max(first, y - g.y0));
  g.rows[g.from].style.transform = shift(g, dy);
  g.to = dropIndex(g.rects, g.from, dy, g.axis);
  setSlides(g);
};

/**
 * Starts the gesture a pointer-down on a pinned `row` may become.
 * `onDrop(from, to)` is called with the row's old and new place among the
 * pinned rows when it was moved. `options`: `{ list, rows, axis }`, the
 * selectors of the list and its rows and 'y' or 'x' (the pinned chats by
 * default). Returns nothing; the listeners remove themselves when the
 * gesture ends.
 */
export const beginPinGesture = (e, row, onDrop, options = {}) => {
  const g = gestureOf(e, row, { ...PINNED, axis: 'y', ...options });
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
    const along = g.axis === 'x' ? ev.clientX : ev.clientY;
    const across = g.axis === 'x' ? ev.clientY : ev.clientX;
    const far = Math.hypot(across - g.x0, along - g.y0);
    if (!g.active && g.touch && far > SCROLL_PX) {
      end(false);
    } else if (!g.active && !g.touch && far >= DRAG_START_PX) {
      lift(g);
    }
    if (g.active) {
      follow(g, along);
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
