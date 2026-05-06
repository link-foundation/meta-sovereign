// Tests for the i18n core (issue #18). Exercises:
//   - dictionary parity (every locale has identical keys to the
//     English source). The CI build fails if a key drifts.
//   - placeholder interpolation, including missing-variable safety.
//   - RFC 4647 §3.4 prefix lookup (zh-Hans-CN → zh, EN_US → en).
//   - detection precedence: stored override beats navigator beats
//     fallback.
//   - persistence + clearing of LOCALE_STORAGE_KEY.
//   - language-switcher SSR markup includes a "system default" option
//     plus one option per available locale.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  LOCALE_STORAGE_KEY,
  detectInitialLocale,
  translate,
  applyLocale,
  LocaleContext,
  availableLocales,
  DEFAULT_LOCALE,
} from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LanguageSwitcher } from '../src/web/language-switcher.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

test('LOCALE_STORAGE_KEY is the documented metaSovereignLocale key', () => {
  assert.equal(LOCALE_STORAGE_KEY, 'metaSovereignLocale');
});

test('availableLocales lists en, ru, zh, hi with ltr direction', () => {
  const ids = availableLocales.map((entry) => entry.id);
  assert.deepEqual(ids.sort(), ['en', 'hi', 'ru', 'zh']);
  for (const entry of availableLocales) {
    assert.equal(entry.dir, 'ltr');
    assert.ok(typeof entry.label === 'string' && entry.label.length > 0);
  }
});

test('every non-en dictionary mirrors the en key set exactly', () => {
  const enKeys = Object.keys(dictionaries.en).sort();
  for (const id of Object.keys(dictionaries)) {
    if (id === 'en') {
      continue;
    }
    const keys = Object.keys(dictionaries[id]).sort();
    assert.deepEqual(
      keys,
      enKeys,
      `${id} dictionary keys must mirror en exactly`
    );
  }
});

test('no English literal leaks into a non-en dictionary (issue #25)', () => {
  // Issue #25: translated builds must not show English copy when the
  // locale is non-English. The heuristic: for every en value that
  // contains 3+ consecutive Latin letters, every non-en dictionary
  // must define a different value. Brand names and identifiers stay
  // on an allow-list because they are language-neutral.
  const HAS_LATIN_WORD = /[A-Za-z]{3,}/;
  // Brand names and runtime identifiers stay in English in every
  // locale. Listing the exact keys keeps the heuristic strict for
  // every other entry.
  const LANG_NEUTRAL = new Set([
    'appName',
    'guide.localServer.rust',
    'guide.localServer.node',
    'guide.localServer.docker',
    // Provider-supplied identifiers that mirror the API's own naming
    // (HTTP header names, env var keys) stay verbatim across locales.
    'connections.superjob.fields.appId.label',
  ]);
  // Some keys hold only filename glob patterns or other technical
  // identifiers (e.g. "*.eml, *.mbox", "result.json", "messages.csv").
  // The convention is that *.archive.fileHint values never contain a
  // translatable sentence, only file globs.
  const isFileHintKey = (key) => key.endsWith('.archive.fileHint');
  // The connections.<provider>.label keys hold the provider's brand
  // name (Telegram, GitHub, WhatsApp, …) and are language-neutral.
  const isProviderLabelKey = (key) =>
    /^connections\.[a-z0-9-]+\.label$/.test(key);
  // Strip ICU-lite placeholders ({name}) before deciding whether the
  // value carries English copy: '{current} / {total}' is a layout
  // primitive, not a translatable sentence.
  const stripPlaceholders = (s) => s.replace(/\{[^}]+\}/g, '');
  for (const [key, enValue] of Object.entries(dictionaries.en)) {
    if (typeof enValue !== 'string') {
      continue;
    }
    if (LANG_NEUTRAL.has(key)) {
      continue;
    }
    if (isFileHintKey(key)) {
      continue;
    }
    if (isProviderLabelKey(key)) {
      continue;
    }
    if (!HAS_LATIN_WORD.test(stripPlaceholders(enValue))) {
      continue;
    }
    for (const id of Object.keys(dictionaries)) {
      if (id === 'en') {
        continue;
      }
      assert.notStrictEqual(
        dictionaries[id][key],
        enValue,
        `${id}.${key} is identical to en — translation missing`
      );
    }
  }
});

test('every translated string is non-empty in every locale', () => {
  for (const id of Object.keys(dictionaries)) {
    for (const [key, value] of Object.entries(dictionaries[id])) {
      assert.equal(typeof value, 'string', `${id}.${key} must be a string`);
      assert.ok(value.length > 0, `${id}.${key} must not be empty`);
    }
  }
});

test('translate falls back to en for unknown locales', () => {
  assert.equal(translate('en', 'common.save'), dictionaries.en['common.save']);
  // Unknown locale falls back to en.
  assert.equal(translate('xx', 'common.save'), dictionaries.en['common.save']);
});

test('translate returns the key when missing in every dictionary', () => {
  assert.equal(translate('en', 'no.such.key'), 'no.such.key');
});

test('translate interpolates {placeholders}', () => {
  const formatted = translate('en', 'tutorial.progress', {
    current: 2,
    total: 5,
  });
  assert.equal(formatted, 'Step 2 of 5');
});

test('translate leaves unknown placeholders intact', () => {
  const formatted = translate('en', 'tutorial.progress', { current: 2 });
  assert.equal(formatted, 'Step 2 of {total}');
});

test('translate works for every locale that defines the same key', () => {
  for (const id of Object.keys(dictionaries)) {
    const out = translate(id, 'tutorial.progress', { current: 1, total: 3 });
    assert.ok(typeof out === 'string' && out.length > 0);
    // Placeholders must be substituted in every locale.
    assert.ok(!out.includes('{current}'), `${id} must replace {current}`);
    assert.ok(!out.includes('{total}'), `${id} must replace {total}`);
  }
});

test('detectInitialLocale prefers a stored override over navigator', () => {
  const storage = fakeStorage();
  storage.setItem(LOCALE_STORAGE_KEY, 'ru');
  assert.equal(
    detectInitialLocale({
      storage,
      navigator: { languages: ['zh-CN'], language: 'zh-CN' },
    }),
    'ru'
  );
});

test('detectInitialLocale walks navigator.languages and prefix-matches zh-Hans-CN → zh', () => {
  assert.equal(
    detectInitialLocale({
      storage: fakeStorage(),
      navigator: { languages: ['zh-Hans-CN', 'en'], language: 'zh-Hans-CN' },
    }),
    'zh'
  );
});

test('detectInitialLocale handles BCP-47 underscore form (en_US)', () => {
  assert.equal(
    detectInitialLocale({
      storage: fakeStorage(),
      navigator: { languages: ['en_US'], language: 'en_US' },
    }),
    'en'
  );
});

test('detectInitialLocale falls back to default when nothing matches', () => {
  assert.equal(
    detectInitialLocale({
      storage: fakeStorage(),
      navigator: { languages: ['fr-FR', 'es-ES'], language: 'fr-FR' },
    }),
    DEFAULT_LOCALE
  );
});

test('detectInitialLocale tolerates a navigator without languages array', () => {
  assert.equal(
    detectInitialLocale({
      storage: fakeStorage(),
      navigator: { language: 'hi-IN' },
    }),
    'hi'
  );
});

test('detectInitialLocale tolerates a missing storage', () => {
  assert.equal(
    detectInitialLocale({
      storage: null,
      navigator: { languages: ['ru-RU'], language: 'ru-RU' },
    }),
    'ru'
  );
});

test('detectInitialLocale tolerates a storage that throws', () => {
  const broken = {
    getItem: () => {
      throw new Error('locked');
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.equal(
    detectInitialLocale({
      storage: broken,
      navigator: { languages: ['hi'], language: 'hi' },
    }),
    'hi'
  );
});

test('applyLocale sets <html lang> and <html dir> when document is available', () => {
  const attrs = {};
  const fakeDocument = {
    documentElement: {
      setAttribute: (name, value) => {
        attrs[name] = value;
      },
    },
  };
  applyLocale('zh', { document: fakeDocument });
  assert.equal(attrs.lang, 'zh');
  assert.equal(attrs.dir, 'ltr');
});

test('applyLocale is a no-op when document is unavailable (SSR-safe)', () => {
  applyLocale('ru', { document: null });
});

test('LanguageSwitcher renders a system-default option plus every locale', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale: 'en',
          setLocale: () => {},
          clearLocale: () => {},
          t: (key) => key,
          available: availableLocales,
        },
      },
      React.createElement(LanguageSwitcher)
    )
  );
  assert.match(html, /value="__system__"/);
  for (const entry of availableLocales) {
    assert.ok(
      html.includes(`value="${entry.id}"`),
      `LanguageSwitcher must render an option for ${entry.id}`
    );
    assert.ok(
      html.includes(entry.label),
      `LanguageSwitcher must render the ${entry.id} label "${entry.label}"`
    );
  }
});

test('LanguageSwitcher pre-selects the active locale via the <select value>', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale: 'hi',
          setLocale: () => {},
          clearLocale: () => {},
          t: (key) => key,
          available: availableLocales,
        },
      },
      React.createElement(LanguageSwitcher)
    )
  );
  // React's renderToStaticMarkup adds `selected` to the matching option.
  assert.match(html, /<option[^>]*value="hi"[^>]*selected/);
});

test('default LocaleContext returns translations from the default locale', () => {
  // The fallback context exposes a working `t` so components can render
  // before the App-level <Provider> is mounted (used by the tutorial
  // tests that render TutorialOverlay in isolation).
  const Probe = () => {
    const ctx = React.useContext(LocaleContext);
    return React.createElement('span', null, ctx.t('common.save'));
  };
  const html = renderToStaticMarkup(React.createElement(Probe));
  assert.ok(html.includes(dictionaries[DEFAULT_LOCALE]['common.save']));
});
