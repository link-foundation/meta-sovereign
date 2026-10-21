/**
 * A message's touch gestures, as in Telegram Web A (R-Y67,
 * `useContextMenuHandlers.ts`, `useOuterHandlers.ts`): a long press opens
 * its menu, a swipe to the left replies to it, a double tap reacts with
 * the default reaction. A move cancels the press; a mostly-vertical move
 * is the list scrolling, never a swipe.
 */

import { useRef } from 'react';

// Web A opens the menu after this long a press.
export const LONG_PRESS_MS = 200;
// Two taps this close are a double tap.
export const DOUBLE_TAP_MS = 300;
// A swipe this far (px, to the left) replies; the bubble follows the
// finger up to SWIPE_MAX_PX.
export const SWIPE_REPLY_PX = 60;
const SWIPE_MAX_PX = 90;
// A finger that moved this far is not pressing.
const MOVE_SLOP_PX = 10;

const pointOf = (event) => event.touches?.[0] ?? event.changedTouches?.[0];

/**
 * The swipe after a move of (dx, dy) from the touch's start: how far the
 * bubble follows (≤ 0), or null when it is not a swipe to the left.
 */
export const swipeOffset = (dx, dy) =>
  dx < -MOVE_SLOP_PX && Math.abs(dx) > Math.abs(dy) * 1.5
    ? Math.max(dx, -SWIPE_MAX_PX)
    : null;

/**
 * Touch handlers for a message row: `{ onTouchStart, onTouchMove,
 * onTouchEnd, onTouchCancel }`. `onLongPress(point)`, `onSwipe()`,
 * `onDoubleTap()`; `enabled()` says whether gestures apply now (not in
 * selection mode, say). `rowRef` is the row the swipe moves.
 */
export const useTouchGestures = ({
  rowRef,
  enabled = () => true,
  onLongPress,
  onSwipe,
  onDoubleTap,
}) => {
  const touch = useRef(null);
  const lastTap = useRef(0);

  const move = (offset) => {
    const node = rowRef.current;
    if (node) {
      node.style.transform = offset ? `translateX(${offset}px)` : '';
      node.classList.toggle('is-swiping', Boolean(offset));
    }
  };

  const end = () => {
    globalThis.clearTimeout(touch.current?.timer);
    const was = touch.current;
    touch.current = null;
    move(0);
    return was;
  };

  return {
    onTouchStart: (event) => {
      if (!enabled() || event.touches?.length !== 1) {
        return;
      }
      const { clientX: x, clientY: y } = pointOf(event);
      const state = { x, y, moved: false, pressed: false, offset: null };
      state.timer = globalThis.setTimeout(() => {
        state.pressed = true;
        onLongPress?.({ x, y });
      }, LONG_PRESS_MS);
      touch.current = state;
    },
    onTouchMove: (event) => {
      const state = touch.current;
      const point = pointOf(event);
      if (!state || !point) {
        return;
      }
      const dx = point.clientX - state.x;
      const dy = point.clientY - state.y;
      if (Math.hypot(dx, dy) > MOVE_SLOP_PX) {
        state.moved = true;
        globalThis.clearTimeout(state.timer);
      }
      if (!state.pressed && onSwipe) {
        state.offset = swipeOffset(dx, dy);
        move(state.offset);
      }
    },
    onTouchEnd: (event) => {
      const state = end();
      if (!state) {
        return;
      }
      if (state.pressed) {
        // The press opened the menu: the lift is not a tap.
        event.preventDefault?.();
        return;
      }
      if ((state.offset ?? 0) <= -SWIPE_REPLY_PX) {
        onSwipe?.();
        return;
      }
      if (state.moved || !onDoubleTap) {
        return;
      }
      const now = Date.now();
      if (now - lastTap.current <= DOUBLE_TAP_MS) {
        lastTap.current = 0;
        event.preventDefault?.();
        onDoubleTap();
      } else {
        lastTap.current = now;
      }
    },
    onTouchCancel: () => {
      end();
    },
  };
};
