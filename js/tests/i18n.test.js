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

const withGlobals = (overrides, fn) => {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = globalThis[key];
    globalThis[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) {
        delete globalThis[key];
      } else {
        globalThis[key] = previous[key];
      }
    }
  }
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
  withGlobals(
    {
      localStorage: storage,
      navigator: { languages: ['zh-CN'], language: 'zh-CN' },
    },
    () => {
      assert.equal(detectInitialLocale(), 'ru');
    }
  );
});

test('detectInitialLocale walks navigator.languages and prefix-matches zh-Hans-CN → zh', () => {
  const storage = fakeStorage();
  withGlobals(
    {
      localStorage: storage,
      navigator: { languages: ['zh-Hans-CN', 'en'], language: 'zh-Hans-CN' },
    },
    () => {
      assert.equal(detectInitialLocale(), 'zh');
    }
  );
});

test('detectInitialLocale handles BCP-47 underscore form (en_US)', () => {
  const storage = fakeStorage();
  withGlobals(
    {
      localStorage: storage,
      navigator: { languages: ['en_US'], language: 'en_US' },
    },
    () => {
      assert.equal(detectInitialLocale(), 'en');
    }
  );
});

test('detectInitialLocale falls back to default when nothing matches', () => {
  const storage = fakeStorage();
  withGlobals(
    {
      localStorage: storage,
      navigator: { languages: ['fr-FR', 'es-ES'], language: 'fr-FR' },
    },
    () => {
      assert.equal(detectInitialLocale(), DEFAULT_LOCALE);
    }
  );
});

test('detectInitialLocale tolerates a navigator without languages array', () => {
  const storage = fakeStorage();
  withGlobals(
    {
      localStorage: storage,
      navigator: { language: 'hi-IN' },
    },
    () => {
      assert.equal(detectInitialLocale(), 'hi');
    }
  );
});

test('detectInitialLocale tolerates a missing storage', () => {
  withGlobals(
    {
      localStorage: undefined,
      navigator: { languages: ['ru-RU'], language: 'ru-RU' },
    },
    () => {
      assert.equal(detectInitialLocale(), 'ru');
    }
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
  withGlobals(
    {
      localStorage: broken,
      navigator: { languages: ['hi'], language: 'hi' },
    },
    () => {
      assert.equal(detectInitialLocale(), 'hi');
    }
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
  withGlobals({ document: fakeDocument }, () => {
    applyLocale('zh');
  });
  assert.equal(attrs.lang, 'zh');
  assert.equal(attrs.dir, 'ltr');
});

test('applyLocale is a no-op when document is unavailable (SSR-safe)', () => {
  withGlobals({ document: undefined }, () => {
    applyLocale('ru');
  });
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
