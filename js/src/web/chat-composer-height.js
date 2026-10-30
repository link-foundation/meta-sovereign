import { useLayoutEffect } from 'react';

// One row must not hide the rest of a restored or selected multiline draft.
// CSS caps the height; watch width as wrapping also changes the content height.
export const useComposerHeight = (box, text, enabled = true) => {
  useLayoutEffect(() => {
    const node = box.current;
    if (!node || !enabled) {
      return undefined;
    }
    const fit = () => {
      const style = globalThis.getComputedStyle(node);
      const padding =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const border =
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight + (style.boxSizing === 'border-box' ? border : -padding)}px`;
    };
    fit();
    let width = node.clientWidth;
    let frame;
    const observer = new globalThis.ResizeObserver(() => {
      if (width !== node.clientWidth) {
        width = node.clientWidth;
        // Resizing the observed input during observer delivery can loop in
        // WebKit. Apply wrapping changes in the next animation frame instead.
        globalThis.cancelAnimationFrame(frame);
        frame = globalThis.requestAnimationFrame(fit);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      globalThis.cancelAnimationFrame(frame);
    };
  }, [box, text, enabled]);
};
