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
    const observer = new globalThis.ResizeObserver(() => {
      if (width !== node.clientWidth) {
        width = node.clientWidth;
        fit();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [box, text, enabled]);
};
