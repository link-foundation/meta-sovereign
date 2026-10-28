// The pure parts of cloud themes (R-Y209; learned, never copied): which
// links name a theme, what a stored choice is, which CSS tokens a theme
// sets and which mode (light or dark) it asks for. A theme's colours are
// `{ light, dark }`, each `{ base, accent, outgoing, messages }` or null,
// as the server keeps them.

import { previewOf, themeVars } from './chat-theme-model.js';

export const CLOUD_THEME_KEY = 'metaSovereignCloudTheme';

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;
const SLUG = /^[A-Za-z0-9_-]{1,64}$/;
const DIGITS = /^\d{1,20}$/;

/** The slug of a theme's link (t.me/addtheme/slug, tg://addtheme?slug=), or null. */
export const addthemeSlugOf = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return null;
  }
  let slug = null;
  if (url.protocol === 'tg:') {
    slug = url.hostname === 'addtheme' ? url.searchParams.get('slug') : null;
  } else if (
    ['http:', 'https:'].includes(url.protocol) &&
    HOSTS.test(url.hostname) &&
    !url.username &&
    !url.password
  ) {
    slug = /^\/addtheme\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  return SLUG.test(slug ?? '') ? slug : null;
};

const settingsOf = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
  const accent = num(value.accent);
  if (accent === null) {
    return null;
  }
  return {
    base: String(value.base ?? 'classic'),
    accent,
    outgoing: num(value.outgoing),
    messages: Array.isArray(value.messages)
      ? value.messages.map(num).filter((n) => n !== null)
      : [],
  };
};

/** A theme as the page keeps it (from the server or from storage), or null. */
export const cleanTheme = (raw) => {
  if (!raw || typeof raw !== 'object' || !SLUG.test(String(raw.slug ?? ''))) {
    return null;
  }
  const light = settingsOf(raw.light);
  const dark = settingsOf(raw.dark);
  return {
    id: DIGITS.test(String(raw.id ?? '')) ? String(raw.id) : '',
    accessHash: DIGITS.test(String(raw.accessHash ?? ''))
      ? String(raw.accessHash)
      : '',
    slug: String(raw.slug),
    title: String(raw.title ?? '').slice(0, 128),
    light,
    dark,
  };
};

/** Whether the theme has colours to apply (a file-only theme has none). */
export const applicable = (theme) => Boolean(theme?.light || theme?.dark);

/**
 * The mode a theme asks for: a theme with only dark (or only light)
 * colours forces that mode; one with both leaves the user's mode alone.
 */
export const modeOf = (theme) => {
  if (theme?.dark && !theme.light) {
    return 'dark';
  }
  return theme?.light && !theme.dark ? 'light' : null;
};

/**
 * The tokens the theme sets on the page for `dark` or light: the accent
 * (also as the chat accent and the fill of primary buttons) and the
 * outgoing bubble with text that reads on it. `{}` for none.
 */
export const cloudVars = (theme, dark) => {
  const vars = themeVars(theme, dark);
  const accent = vars['--chat-accent'];
  return {
    ...(accent
      ? {
          '--accent': accent,
          '--accent-fill': vars['--chat-accent-fill'],
          '--chat-accent': accent,
          '--chat-accent-fill': vars['--chat-accent-fill'],
        }
      : {}),
    ...(vars['--bubble-out']
      ? {
          '--bubble-out': vars['--bubble-out'],
          '--bubble-out-text': vars['--bubble-out-text'],
        }
      : {}),
  };
};

/** The names of all tokens a theme may set (to clear them again). */
export const CLOUD_VARS = Object.freeze([
  '--accent',
  '--accent-fill',
  '--chat-accent',
  '--chat-accent-fill',
  '--bubble-out',
  '--bubble-out-text',
]);

/** A card's look for `dark` or light: `{ accent, bubble, text, ground }`. */
export const cardLook = (theme, dark) => {
  const look = previewOf(theme, dark);
  return look ? { ...look, ground: dark ? '#17212b' : '#e6ebee' } : null;
};

/** A stored choice `{ theme, before }` from whatever was kept, or null. */
export const cleanChoice = (raw) => {
  const theme = cleanTheme(raw?.theme);
  if (!theme || !applicable(theme)) {
    return null;
  }
  const before = ['system', 'light', 'dark', 'auto'].includes(raw.before)
    ? raw.before
    : null;
  return { theme, before };
};
