// The formatting bar over the message box, as Telegram's apps show one
// for selected text (learned, never copied): text selected in the box,
// a row of buttons above it — bold, italic, underline, strikethrough,
// monospace, spoiler, link, plain text — each doing what its shortcut
// does (./text-shortcuts.js), the selection kept.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { applyFormat } from './text-shortcuts.js';

const el = React.createElement;

// Each button: its formatting, what it shows, how it is drawn, its
// shortcut as Desktop has it.
export const FORMAT_BUTTONS = Object.freeze([
  { kind: 'bold', label: 'B', keys: 'B' },
  { kind: 'italic', label: 'I', keys: 'I' },
  { kind: 'underline', label: 'U', keys: 'U' },
  { kind: 'strike', label: 'S', keys: 'Shift+X' },
  { kind: 'code', label: '</>', keys: 'Shift+M' },
  { kind: 'spoiler', label: '▒', keys: 'Shift+P' },
  { kind: 'link', label: '🔗', keys: 'K' },
  { kind: 'plain', label: 'T', keys: 'Shift+N' },
]);

const MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

// Whether `box` holds focus and a selection that is not only spaces.
const selected = (box) => {
  const area = box.current;
  if (!area || globalThis.document?.activeElement !== area) {
    return false;
  }
  const { selectionStart: a, selectionEnd: b, value } = area;
  return (
    b > a &&
    String(value ?? '')
      .slice(a, b)
      .trim().length > 0
  );
};

/**
 * `{ bar }`: the formatting bar while text in `box` is selected;
 * `setText` puts the box's new text when the browser cannot type it.
 */
export const useFormatBar = ({ box, setText }) => {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const doc = globalThis.document;
    if (!doc) {
      return undefined;
    }
    const check = () => setShown(selected(box));
    doc.addEventListener('selectionchange', check);
    // A textarea's selection does not always tell the document (Firefox).
    const area = box.current;
    area?.addEventListener('select', check);
    area?.addEventListener('keyup', check);
    area?.addEventListener('mouseup', check);
    area?.addEventListener('blur', check);
    return () => {
      doc.removeEventListener('selectionchange', check);
      area?.removeEventListener('select', check);
      area?.removeEventListener('keyup', check);
      area?.removeEventListener('mouseup', check);
      area?.removeEventListener('blur', check);
    };
  }, [box.current]);
  const apply = (kind) => {
    if (box.current) {
      applyFormat(box.current, kind, setText);
      setShown(selected(box));
    }
  };
  return {
    bar: shown ? el(FormatBar, { key: 'format', onApply: apply }) : null,
  };
};

const FormatBar = ({ onApply }) => {
  const t = useT();
  const mod = MAC ? '⌘' : 'Ctrl+';
  return el(
    'div',
    {
      className: 'format-bar',
      role: 'toolbar',
      'aria-label': t('chat.format.label'),
    },
    FORMAT_BUTTONS.map(({ kind, label, keys }) =>
      el(
        'button',
        {
          key: kind,
          type: 'button',
          className: `format-button format-${kind}`,
          'data-format': kind,
          title: `${t(`chat.format.${kind}`)} (${mod}${keys})`,
          'aria-label': t(`chat.format.${kind}`),
          // The box keeps its focus and selection.
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => onApply(kind),
        },
        kind === 'link' ? el(Icon, { name: 'connections' }) : label
      )
    )
  );
};
