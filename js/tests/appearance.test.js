// Issue #31 / PR #34: automatic dark/light/system/auto themes and skins
// after the messaging apps (t3.codes by default, Telegram, WhatsApp,
// Signal), chosen in Settings → Appearance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LocaleContext, translate } from '../src/web/i18n.js';
import {
  SKINS,
  SKIN_KEY,
  THEME_KEY,
  THEME_MODES,
  readAppearance,
  resolveTheme,
} from '../src/web/appearance.js';
import { AppearanceSettings } from '../src/web/settings-view.js';

test('resolveTheme: explicit, system and auto by the hour', () => {
  assert.equal(resolveTheme('light', { prefersDark: true }), 'light');
  assert.equal(resolveTheme('dark'), 'dark');
  assert.equal(resolveTheme('system', { prefersDark: true }), 'dark');
  assert.equal(resolveTheme('system', { prefersDark: false }), 'light');
  assert.equal(resolveTheme('auto', { hour: 6 }), 'dark');
  assert.equal(resolveTheme('auto', { hour: 7 }), 'light');
  assert.equal(resolveTheme('auto', { hour: 18, prefersDark: true }), 'light');
  assert.equal(resolveTheme('auto', { hour: 19 }), 'dark');
  assert.equal(resolveTheme('anything', { prefersDark: true }), 'dark');
});

test('readAppearance: stored choices, defaults for unknown values', () => {
  const from = (values) => (key) => values[key] ?? null;
  assert.deepEqual(readAppearance(from({})), { mode: 'system', skin: 't3' });
  assert.deepEqual(
    readAppearance(from({ [THEME_KEY]: 'auto', [SKIN_KEY]: 'telegram' })),
    { mode: 'auto', skin: 'telegram' }
  );
  // The header toggle has always stored "dark"/"light" under this key.
  assert.equal(readAppearance(from({ [THEME_KEY]: 'dark' })).mode, 'dark');
  assert.deepEqual(
    readAppearance(from({ [THEME_KEY]: 'neon', [SKIN_KEY]: 'icq' })),
    { mode: 'system', skin: 't3' }
  );
});

test('every skin but the default has light and dark colours in app.css', () => {
  const css = readFileSync(
    new URL('../src/web/app.css', import.meta.url),
    'utf8'
  );
  for (const skin of SKINS.filter((s) => s !== 't3')) {
    assert.match(css, new RegExp(`:root\\[data-skin='${skin}'\\] \\{`), skin);
    assert.match(
      css,
      new RegExp(`:root\\[data-skin='${skin}'\\]\\[data-theme='dark'\\]`),
      skin
    );
  }
});

const render = (appearance, locale = 'en') =>
  renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale,
          setLocale: () => {},
          t: (k, v) => translate(locale, k, v),
        },
      },
      React.createElement(AppearanceSettings, { appearance })
    )
  );

test('Settings → Appearance: every mode and skin, the current one checked', () => {
  const html = render({
    mode: 'auto',
    skin: 'whatsapp',
    setMode: () => {},
    setSkin: () => {},
  });
  assert.match(html, /<h3 id="appearance-title">Appearance<\/h3>/);
  for (const mode of THEME_MODES) {
    assert.match(html, new RegExp(`value="${mode}"`));
  }
  for (const skin of SKINS) {
    assert.match(html, new RegExp(`value="${skin}"`));
  }
  assert.match(html, /checked="" value="auto"\/> Auto: light by day/);
  assert.match(html, /checked="" value="whatsapp"\/> Like WhatsApp/);
  assert.match(html, /Like t3.codes \(default\)/);
  const ru = render({ mode: 'system', skin: 't3' }, 'ru');
  assert.match(ru, /Внешний вид/);
  assert.match(ru, /Как в системе/);
  assert.match(ru, /Как в Telegram/);
});
