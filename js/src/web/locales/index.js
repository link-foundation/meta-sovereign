// Locale catalogue (issue #18). Single source of truth for the
// dictionaries the SPA bundles plus the metadata the language switcher
// renders (label in the locale's own script + writing direction).
//
// `en` is the source language; every other dictionary mirrors its key
// set exactly. The parity test in js/tests/i18n.test.js fails the
// build if a dictionary drifts.
//
// `dir` is `'ltr'` for all four current locales but is read by
// applyLocale() so adding `ar` / `he` / `fa` later is a one-line
// change instead of a SPA-wide CSS audit.

import { en } from './en.js';
import { ru } from './ru.js';
import { zh } from './zh.js';
import { hi } from './hi.js';

export const dictionaries = { en, ru, zh, hi };

export const availableLocales = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'ru', label: 'Русский', dir: 'ltr' },
  { id: 'zh', label: '中文', dir: 'ltr' },
  { id: 'hi', label: 'हिन्दी', dir: 'ltr' },
];

export const DEFAULT_LOCALE = 'en';
