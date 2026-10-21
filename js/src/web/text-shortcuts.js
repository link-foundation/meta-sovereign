/**
 * Formatting shortcuts in the composer and the edit box, as Telegram
 * Desktop's (R-Y101): the selection is wrapped in the markdown the
 * server sends as Telegram's formatting (../sources/telegram-format.js).
 *
 *   Ctrl/Cmd+B bold          Ctrl/Cmd+I italic
 *   Ctrl/Cmd+Shift+X strike  Ctrl/Cmd+Shift+M monospace
 *   Ctrl/Cmd+Shift+P spoiler Ctrl/Cmd+K link
 *   Ctrl/Cmd+Shift+N plain text (the selection's formatting removed)
 *
 * Keys go by their place (`code`), so they work in any keyboard layout.
 * The change goes in as typing does, so Undo takes it back.
 */

import { parseFormatted, wrapSelection } from '../sources/telegram-format.js';

const PLAIN = {
  KeyB: 'bold',
  KeyI: 'italic',
  KeyK: 'link',
};
const SHIFTED = {
  KeyX: 'strike',
  KeyM: 'code',
  KeyP: 'spoiler',
  KeyN: 'plain',
};

/** The formatting a key press asks for, or null. */
export const formatOfKey = (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return null;
  }
  const table = event.shiftKey ? SHIFTED : PLAIN;
  return table[event.code] ?? null;
};

/** What the shortcut does to `value` with [start, end) selected. */
export const formatEdit = (value, start, end, kind) => {
  if (kind !== 'plain') {
    return wrapSelection(value, start, end, kind);
  }
  const plain = parseFormatted(value.slice(start, end)).text;
  return {
    from: start,
    to: end,
    insert: plain,
    select: [start, start + plain.length],
  };
};

// Replace [from, to) as typing would (kept in Undo), else through
// `setText`. Answers whether the page must still draw the new text.
const put = (area, { from, to, insert }, value, setText) => {
  area.focus();
  area.setSelectionRange(from, to);
  const typed =
    globalThis.document?.execCommand?.('insertText', false, insert) ?? false;
  if (typed && area.value !== value) {
    return false;
  }
  setText(value.slice(0, from) + insert + value.slice(to));
  return true;
};

/**
 * Handle a formatting shortcut in `event` (a textarea's keydown).
 * Answers whether it was one.
 */
export const formatShortcut = (event, setText) => {
  const kind = formatOfKey(event);
  const area = event.target;
  if (!kind || typeof area?.setSelectionRange !== 'function') {
    return false;
  }
  event.preventDefault();
  const value = String(area.value ?? '');
  const edit = formatEdit(
    value,
    area.selectionStart ?? value.length,
    area.selectionEnd ?? value.length,
    kind
  );
  const redrawn = put(area, edit, value, setText);
  const [start, end] = edit.select;
  area.setSelectionRange(start, end);
  if (redrawn) {
    // Once the page has drawn the new text — unless typing went on.
    const next = value.slice(0, edit.from) + edit.insert + value.slice(edit.to);
    globalThis.requestAnimationFrame?.(() => {
      if (area.value === next) {
        area.setSelectionRange(start, end);
      }
    });
  }
  return true;
};
