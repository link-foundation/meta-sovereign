// Reveal the selected tab after async loading, reordering or column resizing.
// Move only this horizontal strip: scrollIntoView can also shift the page.
import { useLayoutEffect, useRef } from 'react';

export const useSelectedTab = (selected, layout) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const strip = ref.current;
    const tab = strip?.querySelector('[role="tab"][aria-selected="true"]');
    if (!tab) {
      return undefined;
    }
    const reveal = () => {
      const bounds = strip.getBoundingClientRect();
      const active = tab.getBoundingClientRect();
      const left = active.left - bounds.left - strip.clientLeft;
      const right = left + active.width - strip.clientWidth;
      if (left < 0 || active.width > strip.clientWidth) {
        strip.scrollLeft += left;
      } else if (right > 0) {
        strip.scrollLeft += right;
      }
    };
    reveal();
    const observer = globalThis.ResizeObserver
      ? new globalThis.ResizeObserver(reveal)
      : null;
    observer?.observe(strip);
    // A preceding folder gaining an unread badge also moves the active tab.
    strip
      .querySelectorAll('[role="tab"]')
      .forEach((item) => observer?.observe(item, { box: 'border-box' }));
    globalThis.addEventListener?.('resize', reveal);
    return () => {
      observer?.disconnect();
      globalThis.removeEventListener?.('resize', reveal);
    };
  }, [selected, layout]);
  return ref;
};
