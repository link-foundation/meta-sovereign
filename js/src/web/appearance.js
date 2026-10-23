// Appearance (issue #31 / PR #34): a theme mode and a skin, chosen in
// Settings and kept in localStorage.
//
//   mode: system (follow the OS), light, dark, or auto (light from 07:00
//         to 19:00 local time, dark otherwise);
//   skin: t3 (default, after t3.codes), telegram, whatsapp or signal —
//         colours and bubble shapes after each app's open-source client,
//         see app.css `[data-skin]`.
//
// The resolved theme goes to <html data-theme>, the skin to
// <html data-skin>, the chosen mode to <html data-theme-mode>. The
// header's Theme button still flips light/dark (an explicit mode).

import { useEffect, useSyncExternalStore } from 'react';

export const THEME_MODES = ['system', 'light', 'dark', 'auto'];
export const SKINS = ['t3', 'telegram', 'whatsapp', 'signal'];
export const THEME_KEY = 'metaSovereignTheme';
export const SKIN_KEY = 'metaSovereignSkin';
const DAY_FROM = 7;
const NIGHT_FROM = 19;

/** `light` or `dark` for a mode, the OS preference and the local hour. */
export const resolveTheme = (mode, { prefersDark = false, hour = 12 } = {}) => {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }
  if (mode === 'auto') {
    return hour >= DAY_FROM && hour < NIGHT_FROM ? 'light' : 'dark';
  }
  return prefersDark ? 'dark' : 'light';
};

const read = (key) => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    // Storage can be disabled in restricted browser contexts.
    return null;
  }
};

const write = (key, value) => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // See read().
  }
};

/** The stored choice; unknown or missing values fall back to defaults. */
export const readAppearance = (get = read) => {
  const mode = get(THEME_KEY);
  const skin = get(SKIN_KEY);
  return {
    mode: THEME_MODES.includes(mode) ? mode : 'system',
    skin: SKINS.includes(skin) ? skin : 't3',
  };
};

let state = null;
const listeners = new Set();
const current = () => (state ??= readAppearance());
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const update = (patch) => {
  state = { ...current(), ...patch };
  write(THEME_KEY, state.mode);
  write(SKIN_KEY, state.skin);
  listeners.forEach((listener) => listener());
};

/** The chosen mode (system, light, dark, auto), outside a component. */
export const currentMode = () => current().mode;

export const setThemeMode = (mode) =>
  THEME_MODES.includes(mode) && update({ mode });
export const setSkin = (skin) => SKINS.includes(skin) && update({ skin });

const prefersDark = () =>
  Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);

const environment = () => ({
  prefersDark: prefersDark(),
  hour: new Date().getHours(),
});

/** `{ mode, skin, theme, setMode, setSkin, toggle }` for any component. */
export const useAppearance = () => {
  const { mode, skin } = useSyncExternalStore(subscribe, current, current);
  const theme = resolveTheme(mode, environment());
  return {
    mode,
    skin,
    theme,
    setMode: setThemeMode,
    setSkin,
    toggle: () => setThemeMode(theme === 'dark' ? 'light' : 'dark'),
  };
};

const apply = (mode, skin) => {
  const root = globalThis.document?.documentElement;
  if (!root) {
    return;
  }
  root.dataset.theme = resolveTheme(mode, environment());
  root.dataset.themeMode = mode;
  root.dataset.skin = skin;
};

/**
 * Keeps <html> in step with the choice: on change, when the OS switches
 * light/dark (system), and every minute (auto, for the hour).
 */
export const useApplyAppearance = () => {
  const { mode, skin } = useSyncExternalStore(subscribe, current, current);
  useEffect(() => {
    apply(mode, skin);
    const again = () => apply(mode, skin);
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', again);
    const timer =
      mode === 'auto' ? globalThis.setInterval(again, 60_000) : null;
    return () => {
      media?.removeEventListener?.('change', again);
      if (timer) {
        globalThis.clearInterval(timer);
      }
    };
  }, [mode, skin]);
};
