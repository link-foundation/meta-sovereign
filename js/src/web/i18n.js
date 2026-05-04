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

const interpolate = (template, vars) => {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    return match;
  });
};

export const translate = (locale, key, vars) => {
  const direct = lookup(locale, key);
  if (typeof direct === 'string') {
    return interpolate(direct, vars);
  }
  const fallback = lookup(DEFAULT_LOCALE, key);
  if (typeof fallback === 'string') {
    return interpolate(fallback, vars);
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

export const useLocaleContext = () => React.useContext(LocaleContext);

export { availableLocales, DEFAULT_LOCALE };
