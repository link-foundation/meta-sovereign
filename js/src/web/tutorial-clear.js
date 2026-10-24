// The card never covers the control it asks the user to click (R-Z22).
//
// A card docked to the screen edge (a section too big for a side, a
// short or narrow screen, taller fonts than the developer's) can end
// up over its own target: the target was scrolled "into view" before
// the card's size was known. Once the card is placed, this checks the
// two boxes and, if they meet, scrolls the target into the band the
// card leaves free (`scroll-margin` on the target, so every clipping
// container — the page, a drawer — takes part). If the target cannot
// be moved clear (the band is smaller than the target and the page
// cannot scroll further) the card collapses to its title and buttons,
// which is the smaller dock.

import { useEffect, useState } from 'react';
import { GAP, intersects } from './tutorial-placement.js';

const ATTEMPT_DELAYS_MS = [0, 250, 700];
const RESIZE_DEBOUNCE_MS = 60;
const GESTURE_MS = 150;
const PRESS_EVENTS = ['pointerdown', 'mousedown', 'touchstart'];
const RELEASE_EVENTS = [
  'pointerup',
  'pointercancel',
  'mouseup',
  'touchend',
  'touchcancel',
];
const KEY_EVENTS = ['keydown', 'wheel'];

const boxOf = (node) => {
  const r = node.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

/**
 * Where the card leaves room: `{top, bottom, below}` in screen
 * coordinates. A card in the lower half leaves the space above it.
 */
export const freeBand = (card, viewport, chromeBottom = 0) => {
  const below = card.top + card.height / 2 > viewport.height / 2;
  return below
    ? { top: chromeBottom, bottom: card.top - GAP, below }
    : { top: card.top + card.height + GAP, bottom: viewport.height, below };
};

/**
 * Is the target where the card leaves it? A target that fits the free
 * band must not meet the card at all. One taller than the band (the
 * services grid) runs under the card by nature: it is read from its
 * top, so that top must sit in the upper part of the band, with the
 * first controls (sign-ins, the first services) in the clear.
 */
export const placedClear = (target, card, band, viewport) => {
  if (!intersects(card, target)) {
    return true;
  }
  // Too tall for the screen even without a card: read from the top.
  if (target.height <= viewport.height - band.top - GAP) {
    return false;
  }
  const size = band.bottom - band.top;
  return target.top >= band.top - 2 && target.top <= band.top + size / 4;
};

// The scrolling port is the whole window, including the strip a phone's
// bottom navigation covers (`viewport.height` leaves that strip out).
const screenHeight = () => globalThis.innerHeight ?? 0;

const scrollInto = (element, band, block) => {
  const style = element.style;
  const saved = [style.scrollMarginTop, style.scrollMarginBottom];
  style.scrollMarginTop = `${Math.max(0, band.top)}px`;
  style.scrollMarginBottom = `${Math.max(0, screenHeight() - band.bottom)}px`;
  try {
    element.scrollIntoView?.({ block, inline: 'nearest', behavior: 'auto' });
  } finally {
    [style.scrollMarginTop, style.scrollMarginBottom] = saved;
  }
};

/**
 * One check: 'clear' when the target (and the control the step names
 * inside it, `mustShow`) is where the card leaves it, else it scrolls
 * and reports 'scrolled', or 'stuck' (nothing more to scroll).
 */
export const clearOnce = (element, cardNode, viewport, mustShow = '') => {
  const chrome = document.querySelector('.topbar')?.getBoundingClientRect();
  const band = freeBand(boxOf(cardNode), viewport, chrome?.bottom ?? 0);
  const control = mustShow ? element.querySelector(mustShow) : null;
  const ok = () => {
    const card = boxOf(cardNode);
    const covered = control && intersects(card, boxOf(control));
    return placedClear(boxOf(element), card, band, viewport) && !covered;
  };
  if (ok()) {
    return 'clear';
  }
  const target = boxOf(element);
  const fits = target.height <= band.bottom - band.top;
  scrollInto(element, band, fits ? 'nearest' : 'start');
  if (control && !ok()) {
    scrollInto(control, band, 'nearest');
  }
  return ok() ? 'scrolled' : 'stuck';
};

/**
 * Keeps the target clear of the card after every placement. Returns
 * true when the card had to collapse (title and buttons only).
 */
export const useClearOfCard = ({
  cardRef,
  element,
  stepId,
  placed,
  cardSize,
  viewportOf,
  mustShow = '',
}) => {
  const [collapsed, setCollapsed] = useState(null);
  const compact = collapsed === stepId;
  const key = `${placed?.side}|${placed?.style?.top}|${placed?.style?.left}`;
  useEffect(() => {
    const node = cardRef.current;
    if (
      !element?.isConnected ||
      !node ||
      !placed ||
      placed.side === 'pending'
    ) {
      return undefined;
    }
    // While the user is acting (a button held down, a key, the wheel)
    // the page is theirs: a scroll now could move the control from
    // under the click. The check waits for the gesture to end.
    let busyUntil = 0;
    let waiting = 0;
    let pressed = false;
    const onPress = () => {
      pressed = true;
    };
    const onRelease = () => {
      pressed = false;
    };
    const onKey = () => {
      busyUntil = Date.now() + GESTURE_MS;
    };
    const listeners = [
      ...PRESS_EVENTS.map((name) => [name, onPress]),
      ...RELEASE_EVENTS.map((name) => [name, onRelease]),
      ...KEY_EVENTS.map((name) => [name, onKey]),
    ];
    const doc = globalThis.document;
    listeners.forEach(([name, fn]) => doc.addEventListener(name, fn, true));
    const check = (final) => {
      const wait = pressed ? GESTURE_MS : busyUntil - Date.now();
      if (wait > 0) {
        globalThis.clearTimeout(waiting);
        waiting = globalThis.setTimeout(() => check(final), wait + 20);
        return;
      }
      const result =
        element.isConnected && node.isConnected
          ? clearOnce(element, node, viewportOf(), mustShow)
          : 'clear';
      if (result === 'stuck' && final) {
        setCollapsed(stepId);
      }
    };
    const timers = ATTEMPT_DELAYS_MS.map((delay, i) =>
      globalThis.setTimeout(() => {
        check(i === ATTEMPT_DELAYS_MS.length - 1);
      }, delay)
    );
    // The target can change size after the card is placed (a panel
    // that finishes loading, a tab with less in it): check again.
    let late = 0;
    const Observer = globalThis.ResizeObserver;
    const observer = Observer
      ? new Observer(() => {
          globalThis.clearTimeout(late);
          globalThis.clearTimeout(waiting);
          late = globalThis.setTimeout(() => check(true), RESIZE_DEBOUNCE_MS);
        })
      : null;
    observer?.observe(element);
    return () => {
      timers.forEach((timer) => globalThis.clearTimeout(timer));
      globalThis.clearTimeout(late);
      observer?.disconnect();
      listeners.forEach(([name, fn]) =>
        doc.removeEventListener(name, fn, true)
      );
    };
  }, [stepId, element, key, cardSize?.height, compact]);
  return compact;
};
