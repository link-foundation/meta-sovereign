// Draggable column dividers, with keyboard controls and saved widths.
import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const PanelDivider = ({
  name,
  variable,
  initial = 320,
  min = 200,
  max = 600,
  side = 'right',
  target = null,
}) => {
  const t = useT();
  const node = useRef(null);
  const end = useRef(() => {});
  const key = `meta-sovereign.panel.${name}`;
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(globalThis.localStorage?.getItem(key));
      return stored ? clamp(stored, min, max) : initial;
    } catch {
      return initial;
    }
  });
  const choose = (value) => setWidth(clamp(value, min, max));
  useEffect(() => {
    const panel = target
      ? node.current?.closest(target)
      : node.current?.parentElement;
    panel?.style.setProperty(variable, `${width}px`);
    try {
      globalThis.localStorage?.setItem(key, String(width));
    } catch {
      /* session only */
    }
  }, [width, variable, target]);
  useEffect(() => () => end.current(), []);
  const begin = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    end.current();
    const start = event.clientX;
    const base = width;
    const move = (e) =>
      choose(base + (e.clientX - start) * (side === 'left' ? -1 : 1));
    const stop = () => {
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', stop);
      globalThis.removeEventListener('pointercancel', stop);
      node.current?.classList.remove('is-resizing');
    };
    end.current = stop;
    node.current?.classList.add('is-resizing');
    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', stop);
    globalThis.addEventListener('pointercancel', stop);
  };
  const onKeyDown = (event) => {
    const steps = { ArrowLeft: -16, ArrowRight: 16 };
    if (event.key in steps || ['Home', 'End', 'Enter'].includes(event.key)) {
      event.preventDefault();
      choose(
        event.key === 'Home'
          ? min
          : event.key === 'End'
            ? max
            : event.key === 'Enter'
              ? initial
              : width + steps[event.key] * (side === 'left' ? -1 : 1)
      );
    }
  };
  return el('div', {
    ref: node,
    role: 'separator',
    tabIndex: 0,
    className: `panel-divider on-${side}`,
    'data-panel-divider': name,
    'aria-orientation': 'vertical',
    'aria-label': t(`panels.${name}`),
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': width,
    title: t('panels.hint'),
    onPointerDown: begin,
    onKeyDown,
    onDoubleClick: () => choose(initial),
  });
};
