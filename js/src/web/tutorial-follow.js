// How the tutorial card stays with its target while the page scrolls.
//
// A card moved from JS on every scroll trails the page by a frame, and
// one tied to the target with CSS anchor positioning and clamped to the
// screen jumps: WebKit moves it with the scroll and snaps it back a
// frame later, Chromium lets it scroll off the screen. So the card is
// placed once and the browser does the rest, in one of three frames:
//   - 'page': the target scrolls with the document. The card sits in
//     document coordinates (position: absolute) and scrolls with it,
//     in the same frame;
//   - 'fixed': the target lives in a fixed or sticky bar (the
//     navigation). The card is fixed to the screen, like the target;
//   - 'pinned': the target is taller than the screen, or no side has
//     room (the card docks). The card stays put on the screen while
//     the page scrolls under it.
// It is placed again only on a new step, a resize, a change of layout,
// or when a scroll ends with the card off screen and the target on it;
// then it glides to its new place instead of jumping.
//
// Pure helpers (tested in node) plus the hooks the overlay uses.

import { useEffect, useRef, useState } from 'react';
import { choosePlacement, MARGIN } from './tutorial-placement.js';

const FIXED_POSITIONS = new Set(['fixed', 'sticky']);

/** 'fixed' when the element sits in a fixed or sticky ancestor. */
export const targetFrame = (element, view = globalThis) => {
  for (let node = element; node?.nodeType === 1; node = node.parentElement) {
    const position = view.getComputedStyle?.(node)?.position;
    if (FIXED_POSITIONS.has(position)) {
      return 'fixed';
    }
  }
  return 'page';
};

const scrollOf = (view = globalThis) => ({
  x: view.scrollX ?? 0,
  y: view.scrollY ?? 0,
});

/** A viewport rect in document coordinates. */
export const pageRectOf = (rect, scroll = scrollOf()) =>
  rect && {
    top: rect.top + scroll.y,
    left: rect.left + scroll.x,
    width: rect.width,
    height: rect.height,
  };

/** A document rect on the screen at the current scroll. */
export const screenRectOf = (page, scroll = scrollOf()) =>
  page && {
    top: page.top - scroll.y,
    left: page.left - scroll.x,
    width: page.width,
    height: page.height,
  };

/** Too tall to share the screen with a card above or below it. */
export const isTall = (rect, viewport) =>
  rect.height > viewport.height - 2 * MARGIN;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const px = (n) => `${Math.round(n)}px`;

/**
 * Where the card goes and in which frame.
 *
 * `placement` comes from choosePlacement() for the target's rect on
 * the screen; `origin` is the overlay's top-left on the screen at the
 * same moment (page coordinates are relative to it).
 *
 * @returns {{mode: 'page'|'fixed'|'pinned', side, top, left,
 *            arrow: number|null, style: object}}
 */
export const followLayout = ({
  placement,
  frame,
  target,
  card,
  viewport,
  origin = { top: 0, left: 0 },
}) => {
  const { side } = placement;
  const sided = side !== 'center' && side !== 'dock';
  const across = side === 'left' || side === 'right';
  let { top, arrow } = placement;
  let mode = frame === 'fixed' ? 'fixed' : 'page';
  if (!sided) {
    mode = 'pinned';
  } else if (across && isTall(target, viewport)) {
    // Beside a section taller than the screen: the middle of the
    // screen, pointing at the section's edge, wherever it scrolls.
    mode = 'pinned';
    top = clamp(
      (viewport.height - card.height) / 2,
      MARGIN,
      Math.max(MARGIN, viewport.height - MARGIN - card.height)
    );
    arrow = card.height / 2;
  }
  const page = mode === 'page';
  const style = {
    position: page ? 'absolute' : 'fixed',
    top: px(page ? top - origin.top : top),
    left: px(page ? placement.left - origin.left : placement.left),
  };
  return { mode, side, top, left: placement.left, arrow, style };
};

const round = (rect) =>
  rect
    ? [rect.top, rect.left, rect.width, rect.height].map(Math.round).join(',')
    : '';

// What the placement depends on. A page target's document position
// does not change while the document scrolls; a pinned card does not
// depend on where the target is vertically at all.
const placementKey = ({
  stepId,
  version,
  card,
  viewport,
  frame,
  rect,
  page,
}) => {
  const tall = isTall(rect, viewport);
  const where = tall
    ? [rect.left, rect.width, rect.height].map(Math.round).join(',')
    : round(frame === 'page' ? page : rect);
  return [
    stepId,
    version,
    card.width,
    card.height,
    viewport.width,
    viewport.height,
    frame,
    tall ? 'tall' : '',
    where,
  ].join('|');
};

const placeCard = ({ rect, card, viewport, frame, overlay }) => {
  const placement = choosePlacement({ target: rect, card, viewport });
  const o = overlay?.getBoundingClientRect?.();
  return followLayout({
    placement,
    frame,
    target: rect,
    card,
    viewport,
    origin: o ? { top: o.top, left: o.left } : undefined,
  });
};

const reducedMotion = () =>
  Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

/**
 * The card's layout for the current target, kept until something other
 * than a scroll of the target's own frame changes. `animate` is true
 * when the card moves to a new place within the same step and frame
 * (it then glides there with a CSS transition).
 */
export const useCardPlacement = ({
  stepId,
  target,
  cardSize,
  viewport,
  overlayRef,
  version,
}) => {
  const memo = useRef(null);
  if (!target?.rect || !cardSize) {
    memo.current = null;
    return null;
  }
  const { frame } = target;
  const page = target.page ?? pageRectOf(target.rect);
  // A page target's rect on the screen, now: the page may have scrolled
  // since it was last read (that does not re-render).
  const rect = frame === 'page' ? screenRectOf(page) : target.rect;
  const key = placementKey({
    stepId,
    version,
    card: cardSize,
    viewport,
    frame,
    rect,
    page,
  });
  const prev = memo.current;
  if (prev?.key === key) {
    return prev.layout;
  }
  const layout = placeCard({
    rect,
    card: cardSize,
    viewport,
    frame,
    overlay: overlayRef.current,
  });
  // Following the target (a nested scroll, the layout shifting) is
  // instant; moving to a better place is a glide.
  const moved =
    prev &&
    prev.stepId === stepId &&
    prev.layout.mode === layout.mode &&
    (prev.version !== version ||
      prev.size !== `${viewport.width}x${viewport.height}`);
  layout.animate = Boolean(moved) && !reducedMotion();
  memo.current = {
    key,
    stepId,
    version,
    size: `${viewport.width}x${viewport.height}`,
    layout,
  };
  return layout;
};

const SETTLE_MS = 140;

const onScreen = (r, viewport) =>
  r.top >= 0 &&
  r.left >= 0 &&
  r.bottom <= viewport.height + 0.5 &&
  r.right <= viewport.width + 0.5;

const meets = (r, viewport) =>
  r.bottom > 0 &&
  r.top < viewport.height &&
  r.right > 0 &&
  r.left < viewport.width;

/**
 * Once a scroll has ended: if the card is (partly) off the screen while
 * its target is on it, ask for a new placement. Returns the placement
 * version to feed useCardPlacement().
 */
export const useResettle = ({ cardRef, element, viewportOf }) => {
  const [version, setVersion] = useState(0);
  const latest = useRef(null);
  latest.current = element;
  useEffect(() => {
    let timer = 0;
    const check = () => {
      const target = latest.current;
      const node = cardRef.current;
      if (!target?.isConnected || !node || node.dataset?.follow === 'pinned') {
        return;
      }
      const card = node.getBoundingClientRect();
      const viewport = viewportOf();
      if (
        !onScreen(card, viewport) &&
        meets(target.getBoundingClientRect(), viewport)
      ) {
        setVersion((v) => v + 1);
      }
    };
    const onScroll = () => {
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(check, SETTLE_MS);
    };
    globalThis.addEventListener?.('scroll', onScroll, true);
    return () => {
      globalThis.clearTimeout(timer);
      globalThis.removeEventListener?.('scroll', onScroll, true);
    };
  }, []);
  return version;
};
