import React, { useLayoutEffect, useRef, useState } from 'react';

const el = React.createElement;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
let context;

/** Fit both ends of a label without splitting emoji or combining characters. */
export const middleEllipsis = (text, width, measure) => {
  if (measure(text) <= width) {
    return text;
  }
  const parts = Array.from(segmenter.segment(text), (part) => part.segment);
  const preview = (kept) => {
    const head = Math.ceil(kept / 2);
    const tail = Math.floor(kept / 2);
    return `${parts.slice(0, head).join('')}…${tail ? parts.slice(-tail).join('') : ''}`;
  };
  let low = 0;
  let high = Math.max(0, parts.length - 1);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(preview(mid)) <= width) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return preview(low);
};

/** Only the visible label is shortened; the enclosing control keeps full text. */
export const MiddleEllipsis = ({ text }) => {
  const singleLine = text.replace(/\s+/gu, ' ').trim();
  const ref = useRef(null);
  const [label, setLabel] = useState(singleLine);
  useLayoutEffect(() => {
    const node = ref.current;
    let live = true;
    let frame;
    const fit = () => {
      if (!live || !node.clientWidth) {
        return;
      }
      context ??= node.ownerDocument.createElement('canvas').getContext('2d');
      if (!context) {
        return;
      }
      const style = globalThis.getComputedStyle(node);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.direction = style.direction;
      const spacing = parseFloat(style.letterSpacing) || 0;
      const measure = (value) =>
        context.measureText(value).width +
        Math.max(0, Array.from(value).length - 1) * spacing;
      // Keep a naturally sized short chip intact despite subpixel rounding.
      const width = parseFloat(style.width);
      setLabel(
        measure(singleLine) <= width + 0.5
          ? singleLine
          : middleEllipsis(singleLine, width, measure)
      );
    };
    const schedule = () => {
      if (live) {
        globalThis.cancelAnimationFrame(frame);
        frame = globalThis.requestAnimationFrame(fit);
      }
    };
    fit();
    const observer = new globalThis.ResizeObserver(schedule);
    observer.observe(node);
    const fonts = node.ownerDocument.fonts;
    fonts?.addEventListener('loadingdone', schedule);
    fonts?.ready.then(schedule);
    return () => {
      live = false;
      observer.disconnect();
      globalThis.cancelAnimationFrame(frame);
      fonts?.removeEventListener('loadingdone', schedule);
    };
  }, [singleLine]);
  return el(
    'span',
    {
      ref,
      className: 'middle-ellipsis',
      'data-full-text': singleLine,
      'aria-hidden': true,
    },
    el('span', null, label)
  );
};
