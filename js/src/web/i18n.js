// Internationalisation core (issue #18). ~150 LOC, zero runtime
// dependencies. The SPA-wide `t()` function takes a key and an
// optional placeholder map and returns the translated string in the
// active locale, falling back to English then to the literal key so
// missing translations stay visible instead of crashing.
//
// Detection precedence (highest first):
//   1. `localStorage.metaSovereignLocale` — explicit user choice.
//   2. `navigator.languages` walked in order, RFC 4647 §3.4 prefix
//      matching against `availableLocales`.
//   3. `navigator.language` (single tag) for old browsers.
//   4. `'en'` fallback so the SPA always renders.
//
// applyLocale() mirrors useTheme()'s contract: side effects on
// `document.documentElement` (sets `lang` and `dir`) are idempotent
// and run from the React `useEffect`, never from module init, so the
// module is safe to import in test environments without a DOM.

import React, { useEffect, useMemo, useState } from 'react';
import {
  dictionaries,
  availableLocales,
  DEFAULT_LOCALE,
} from './locales/index.js';

export const LOCALE_STORAGE_KEY = 'metaSovereignLocale';

const localeIds = availableLocales.map((entry) => entry.id);

const normalise = (tag) => {
  if (typeof tag !== 'string' || !tag) {
    return '';
  }
  return tag.toLowerCase().replace(/_/g, '-');
};

// RFC 4647 §3.4 lookup: try the full tag, then keep dropping the
// right-most subtag until a known id matches. `zh-Hans-CN` walks
// `zh-hans-cn` → `zh-hans` → `zh`, hitting the `zh` dictionary.
const matchTag = (tag) => {
  let candidate = normalise(tag);
  while (candidate) {
    if (localeIds.includes(candidate)) {
      return candidate;
    }
    const cut = candidate.lastIndexOf('-');
    if (cut < 0) {
      break;
    }
    candidate = candidate.slice(0, cut);
  }
  return '';
};

const browserPreferences = (navigator) => {
  if (!navigator) {
    return [];
  }
  const list = Array.isArray(navigator.languages)
    ? [...navigator.languages]
    : [];
  if (typeof navigator.language === 'string' && navigator.language) {
    list.push(navigator.language);
  }
  return list;
};

// `env` lets tests inject a navigator + storage without touching the
// real (often read-only in Node/Deno) `globalThis` slots.
export const detectInitialLocale = (env = {}) => {
  const storage =
    'storage' in env ? env.storage : (globalThis.localStorage ?? null);
  const navigator =
    'navigator' in env ? env.navigator : (globalThis.navigator ?? null);
  try {
    const stored = storage?.getItem?.(LOCALE_STORAGE_KEY);
    const matchedStored = matchTag(stored);
    if (matchedStored) {
      return matchedStored;
    }
  } catch {
    // Storage can be disabled in restricted browser contexts.
  }
  for (const tag of browserPreferences(navigator)) {
    const matched = matchTag(tag);
    if (matched) {
      return matched;
    }
  }
  return DEFAULT_LOCALE;
};

const lookup = (locale, key) => {
  const dict = dictionaries[locale];
  if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key];
  }
  return undefined;
};

// ICU MessageFormat's plural subset, so English can say "1 draft" and
// "2 drafts" in one string: {count, plural, one {# draft} other {# drafts}}.
// `#` is the number; the category comes from Intl.PluralRules.
const PLURAL = /\{(\w+), plural,((?:\s*(?:=\d+|\w+) \{[^{}]*\})+)\s*\}/g;
const PLURAL_CASE = /(=\d+|\w+) \{([^{}]*)\}/g;

const pluralize = (template, vars, locale) =>
  template.replace(PLURAL, (match, name, body) => {
    const n = Number(vars[name]);
    if (!Object.prototype.hasOwnProperty.call(vars, name) || Number.isNaN(n)) {
      return match;
    }
    const cases = Object.fromEntries(
      [...body.matchAll(PLURAL_CASE)].map(([, k, v]) => [k, v])
    );
    const text =
      cases[`=${n}`] ??
      cases[new Intl.PluralRules(locale).select(n)] ??
      cases.other ??
      match;
    return text.replace(/#/g, String(vars[name]));
  });

const interpolate = (template, vars, locale) => {
  if (!vars) {
    return template;
  }
  return pluralize(template, vars, locale).replace(
    /\{(\w+)\}/g,
    (match, name) => {
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        return String(vars[name]);
      }
      return match;
    }
  );
};

export const translate = (locale, key, vars) => {
  const direct = lookup(locale, key);
  if (typeof direct === 'string') {
    return interpolate(direct, vars, locale);
  }
  const fallback = lookup(DEFAULT_LOCALE, key);
  if (typeof fallback === 'string') {
    return interpolate(fallback, vars, DEFAULT_LOCALE);
  }
  return key;
};

export const applyLocale = (locale, env = {}) => {
  const entry =
    availableLocales.find((item) => item.id === locale) ?? availableLocales[0];
  const doc = 'document' in env ? env.document : (globalThis.document ?? null);
  const root = doc?.documentElement;
  if (root) {
    root.setAttribute('lang', entry.id);
    root.setAttribute('dir', entry.dir);
  }
};

export const useLocale = () => {
  const [locale, setLocaleState] = useState(detectInitialLocale);

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  const setLocale = (next) => {
    const matched = matchTag(next) || DEFAULT_LOCALE;
    try {
      globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, matched);
    } catch {
      // See detectInitialLocale().
    }
    setLocaleState(matched);
  };

  const clearLocale = () => {
    try {
      globalThis.localStorage?.removeItem(LOCALE_STORAGE_KEY);
    } catch {
      // See detectInitialLocale().
    }
    setLocaleState(detectInitialLocale());
  };

  const t = useMemo(
    () => (key, vars) => translate(locale, key, vars),
    [locale]
  );

  return {
    locale,
    setLocale,
    clearLocale,
    t,
    available: availableLocales,
  };
};

export const LocaleContext = React.createContext({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  clearLocale: () => {},
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
  available: availableLocales,
});

export const useT = () => React.useContext(LocaleContext).t;

/**
 * Text with its first letter capitalized. Trigger, mode and form names
 * are fragments joined into meta lines ("safe: drafts to confirm · by
 * hand"); as labels, options and the start of a line they take sentence
 * case, like every other label.
 */
export const sentence = (text) =>
  typeof text === 'string' && text
    ? text[0].toLocaleUpperCase() + text.slice(1)
    : text;

export const useLocaleContext = () => React.useContext(LocaleContext);

const formatDate = (ts, locale, options) => {
  const date = ts ? new Date(ts) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString(locale, options)
    : '';
};

/**
 * Dates and times in the interface language rather than the browser's,
 * so a Russian screen says "14:05", not "02:05 PM". Seconds are noise
 * in a history list, so they are left out.
 */
export const formatDateTime = (ts, locale = DEFAULT_LOCALE) =>
  formatDate(ts, locale, { dateStyle: 'medium', timeStyle: 'short' });

export const formatTime = (ts, locale = DEFAULT_LOCALE) =>
  formatDate(ts, locale, { timeStyle: 'short' });

/**
 * A chat list's date, as messengers show it: the time today, the
 * weekday within the last week, the day and month this year, and the
 * full date before that — never a bare time for a months-old chat.
 */
export const formatChatTime = (
  ts,
  locale = DEFAULT_LOCALE,
  now = Date.now()
) => {
  const date = ts ? new Date(ts) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  if (date >= today) {
    return formatTime(ts, locale);
  }
  if (date >= weekAgo) {
    return date.toLocaleString(locale, { weekday: 'short' });
  }
  return date.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
};

export const useDates = () => {
  const { locale } = React.useContext(LocaleContext);
  return useMemo(
    () => ({
      dateTime: (ts) => formatDateTime(ts, locale),
      time: (ts) => formatTime(ts, locale),
      chatTime: (ts) => formatChatTime(ts, locale),
    }),
    [locale]
  );
};

export { availableLocales, DEFAULT_LOCALE };
