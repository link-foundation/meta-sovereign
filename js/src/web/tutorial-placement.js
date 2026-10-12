// Where the tutorial card goes relative to the control it explains.
//
// Rules (the common ground of Shepherd, Driver.js, Joyride and Floating
// UI's flip + shift):
//   * the card sits next to the target, never on top of it — the user
//     has to see, and usually click, the highlighted control;
//   * narrow targets (a nav item) prefer a side, wide ones (a card, a
//     panel) prefer above/below; the first side with enough room wins;
//   * along the other axis the card is centred on the target and then
//     shifted to stay inside the viewport, with the arrow still
//     pointing at the target;
//   * if no side has room the card docks to the viewport edge farthest
//     from the target (phones, huge targets) — still not covering it
//     whenever the viewport allows.
//
// Pure functions only: the overlay feeds measured rects in and either
// applies the pixels or turns the side into CSS anchor() expressions.

export const GAP = 12; // between target and card (the arrow lives here)
export const MARGIN = 12; // between card and viewport edge
export const ARROW_INSET = 18; // keep the arrow off the card's corners

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const sidePreference = (target, viewport) =>
  target.width < viewport.width * 0.4
    ? ['right', 'left', 'bottom', 'top']
    : ['bottom', 'top', 'right', 'left'];

const spaceOn = (side, target, viewport) =>
  ({
    right: viewport.width - (target.left + target.width) - GAP - MARGIN,
    left: target.left - GAP - MARGIN,
    bottom: viewport.height - (target.top + target.height) - GAP - MARGIN,
    top: target.top - GAP - MARGIN,
  })[side];

const fits = (side, target, card, viewport) => {
  const horizontal = side === 'left' || side === 'right';
  const along = horizontal ? card.width : card.height;
  const across = horizontal ? card.height : card.width;
  const room = horizontal ? viewport.height : viewport.width;
  return (
    spaceOn(side, target, viewport) >= along && room - 2 * MARGIN >= across
  );
};

const placeOnSide = (side, target, card, viewport) => {
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  if (side === 'left' || side === 'right') {
    const top = clamp(
      centerY - card.height / 2,
      MARGIN,
      viewport.height - MARGIN - card.height
    );
    const left =
      side === 'right'
        ? target.left + target.width + GAP
        : target.left - GAP - card.width;
    const arrow = clamp(centerY - top, ARROW_INSET, card.height - ARROW_INSET);
    return { side, top, left, arrow };
  }
  const left = clamp(
    centerX - card.width / 2,
    MARGIN,
    viewport.width - MARGIN - card.width
  );
  const top =
    side === 'bottom'
      ? target.top + target.height + GAP
      : target.top - GAP - card.height;
  const arrow = clamp(centerX - left, ARROW_INSET, card.width - ARROW_INSET);
  return { side, top, left, arrow };
};

// No side fits: dock to the top or bottom edge, whichever leaves the
// target visible (the one farther from it). A target taller than the
// screen is read from its top, so that top — and whatever leads to it,
// like the tabs above a panel — stays clear: the card docks below.
const dock = (target, card, viewport) => {
  const left = Math.max(MARGIN, (viewport.width - card.width) / 2);
  const targetCenter = target.top + target.height / 2;
  const startsHigh = target.top < viewport.height / 2;
  const top =
    targetCenter > viewport.height / 2 && !startsHigh
      ? MARGIN
      : Math.max(MARGIN, viewport.height - MARGIN - card.height);
  return { side: 'dock', top, left, arrow: null };
};

/**
 * @param {{target: {top,left,width,height}|null,
 *          card: {width,height}, viewport: {width,height}}} input
 * @returns {{side: 'right'|'left'|'top'|'bottom'|'dock'|'center',
 *            top: number, left: number, arrow: number|null}}
 */
export const choosePlacement = ({ target, card, viewport }) => {
  if (!target) {
    return {
      side: 'center',
      top: Math.max(MARGIN, (viewport.height - card.height) / 2),
      left: Math.max(MARGIN, (viewport.width - card.width) / 2),
      arrow: null,
    };
  }
  const side = sidePreference(target, viewport).find((s) =>
    fits(s, target, card, viewport)
  );
  return side
    ? placeOnSide(side, target, card, viewport)
    : dock(target, card, viewport);
};

/** Do two rects overlap (used by tests and the e2e check)? */
export const intersects = (a, b) =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

// CSS for a card on `side` that the browser keeps attached to the
// anchored target while anything scrolls (no JS in the loop). The
// cross axis is clamped to the viewport exactly like placeOnSide().
const A = (edge) => `anchor(--tutorial-target ${edge})`;

export const anchoredCardStyle = (side, card) => {
  const h = `${card.height}px`;
  const w = `${card.width}px`;
  const vertical = `clamp(${MARGIN}px, calc(${A('center')} - ${card.height / 2}px), calc(100% - ${MARGIN}px - ${h}))`;
  const horizontal = `clamp(${MARGIN}px, calc(${A('center')} - ${card.width / 2}px), calc(100% - ${MARGIN}px - ${w}))`;
  switch (side) {
    case 'right':
      return { left: `calc(${A('right')} + ${GAP}px)`, top: vertical };
    case 'left':
      return { right: `calc(${A('left')} + ${GAP}px)`, top: vertical };
    case 'bottom':
      return { top: `calc(${A('bottom')} + ${GAP}px)`, left: horizontal };
    case 'top':
      return { bottom: `calc(${A('top')} + ${GAP}px)`, left: horizontal };
    default:
      return null;
  }
};
