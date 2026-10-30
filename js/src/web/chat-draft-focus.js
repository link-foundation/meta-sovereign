import { useLayoutEffect, useRef } from 'react';

// An explicitly requested test result must be visible even when the reader
// was far back in history. Background drafts do not move the viewport.
export const useDraftFocus = (draft, drafts) => {
  const box = useRef(null);
  useLayoutEffect(() => {
    const node = box.current;
    const scroll = node?.closest('.chat-scroll');
    if (!scroll || drafts.focusId !== draft.id) {
      return;
    }
    const viewport = scroll.getBoundingClientRect();
    const card = node.getBoundingClientRect();
    const reserve = Number.parseFloat(
      globalThis.getComputedStyle(scroll).paddingBottom
    );
    const bottom = viewport.bottom - reserve - 8;
    if (card.bottom > bottom) {
      scroll.scrollTop += card.bottom - bottom;
    } else if (card.top < viewport.top) {
      scroll.scrollTop += card.top - viewport.top;
    }
    node.focus({ preventScroll: true });
    drafts.presented();
  }, [draft.id, drafts.focusId]);
  return box;
};
