// Interface scale and message text size, as Telegram Desktop's Settings →
// Advanced → Interface scale and Chat Settings → Message text size have
// them (R-Y192; learned, never copied): Auto, 100, 110, 125, 150, 175 or
// 200 %, and a text size slider. Kept in this browser (localStorage,
// every access wrapped in try/catch).
//
// How it is applied: the CSS sizes nearly everything in rem, so the scale
// is the <html> font size (a percentage), which works the same in
// Chromium and WebKit (CSS `zoom` is not standard everywhere and breaks
// 100vh layouts). The message text size is the `--chat-font-size`
// variable the bubbles read. "Auto" is 100 %: Desktop derives it from the
// screen's DPI, but a browser already scales the page by its pixel ratio.
//
// Keyboard: Desktop's Ctrl/Cmd + "=" / "-" / "0" are the browser's own
// page-zoom keys, so by default they are left alone. An opt-in switch
// ("Use Ctrl/Cmd + = / − / 0 for the interface scale") takes them over
// while the page is focused; the browser's zoom then does not run, because
// the handler cancels the key. Some browsers do not let a page cancel the
// shortcut, so this stays optional and off.

import { useEffect, useSyncExternalStore } from 'react';

export const UI_SCALE_KEY = 'metaSovereignUiScale';
export const SCALES = Object.freeze(['auto', 100, 110, 125, 150, 175, 200]);
export const TEXT_SIZE = Object.freeze({ min: 12, max: 20, normal: 15 });

export const DEFAULTS = Object.freeze({
  scale: 'auto',
  // Pixels at 100 %, or null for the stylesheet's own size.
  textSize: null,
  keys: false,
});

const textSizeOf = (value) => {
  const n = Number(value);
  return value !== null &&
    value !== undefined &&
    Number.isInteger(n) &&
    n >= TEXT_SIZE.min &&
    n <= TEXT_SIZE.max
    ? n
    : null;
};

/** Settings from whatever was kept (anything wrong falls back). */
export const settingsFrom = (raw) => {
  const kept = raw && typeof raw === 'object' ? raw : {};
  return {
    scale: SCALES.includes(kept.scale) ? kept.scale : DEFAULTS.scale,
    textSize: textSizeOf(kept.textSize),
    keys: kept.keys === true,
  };
};

/** The multiplier a scale means (Auto is 1). */
export const factorOf = (scale) =>
  typeof scale === 'number' && scale > 0 ? scale / 100 : 1;

/** The scale one step up (1), down (-1), or back to Auto (0). */
export const stepScale = (scale, direction) => {
  if (direction === 0) {
    return 'auto';
  }
  const list = SCALES.slice(1);
  const at = list.indexOf(scale === 'auto' ? 100 : scale);
  return list[Math.min(list.length - 1, Math.max(0, at + direction))];
};

/** What a key press asks of the scale: 1, -1, 0 (reset) or null. */
export const keyDirection = (event) => {
  if (!event || !(event.ctrlKey || event.metaKey) || event.altKey) {
    return null;
  }
  if (event.key === '=' || event.key === '+') {
    return 1;
  }
  if (event.key === '-' || event.key === '_') {
    return -1;
  }
  return event.key === '0' ? 0 : null;
};

/** The size of a message's text as the CSS value, or null (unchanged). */
export const chatFontSize = (textSize) =>
  textSize === null ? null : `${textSize / 16}rem`;

export const readUiScale = (storage = globalThis.localStorage) => {
  try {
    return settingsFrom(JSON.parse(storage?.getItem(UI_SCALE_KEY)));
  } catch {
    return settingsFrom(null);
  }
};

export const writeUiScale = (settings, storage = globalThis.localStorage) => {
  try {
    storage?.setItem(UI_SCALE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode: the choice lasts for this page only.
  }
};

/** Puts the settings on <html> (font size and the text size variable). */
export const applyUiScale = (
  settings,
  root = globalThis.document?.documentElement
) => {
  if (!root?.style) {
    return;
  }
  if (settings.scale === 'auto') {
    root.style.removeProperty('font-size');
  } else {
    root.style.setProperty('font-size', `${settings.scale}%`);
  }
  const text = chatFontSize(settings.textSize);
  if (text === null) {
    root.style.removeProperty('--chat-font-size');
  } else {
    root.style.setProperty('--chat-font-size', text);
  }
};

let state = null;
const listeners = new Set();
const current = () => (state ??= readUiScale());
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Changes some of the settings, keeps them and tells the page. */
export const setUiScale = (change) => {
  state = settingsFrom({ ...current(), ...change });
  writeUiScale(state);
  applyUiScale(state);
  listeners.forEach((listener) => listener());
};

/** The settings, and a page that follows them. */
export const useUiScale = () =>
  useSyncExternalStore(subscribe, current, current);

/**
 * Mounted once in the app: applies the settings, and — only when the
 * keyboard switch is on — Ctrl/Cmd + "=" / "-" / "0".
 */
export const useApplyUiScale = () => {
  const settings = useUiScale();
  useEffect(() => applyUiScale(settings), [settings]);
  useEffect(() => {
    if (!settings.keys) {
      return undefined;
    }
    const onKey = (event) => {
      const direction = keyDirection(event);
      if (direction !== null) {
        event.preventDefault();
        setUiScale({ scale: stepScale(current().scale, direction) });
      }
    };
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, [settings.keys]);
};
