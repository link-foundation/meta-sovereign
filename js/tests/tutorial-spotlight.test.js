// Issue #25 R-N9, R-N10: tutorial steps anchor a translucent "spotlight"
// to a `data-tutorial-id` element so newcomers see *which* control they
// should tap next. The default sequence opens with a "Connect a service"
// step that points at the Connections nav entry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { defaultSteps, TutorialSpotlight } from '../src/web/tutorial.js';
import { LocaleContext, availableLocales } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';

const renderInLocale = (locale, node) => {
  const t = (key, vars) => {
    const tpl = dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
    if (!vars) {
      return tpl;
    }
    return String(tpl).replace(/\{(\w+)\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
    );
  };
  const ctx = {
    locale,
    t,
    setLocale: () => {},
    clearLocale: () => {},
    available: availableLocales,
  };
  return renderToStaticMarkup(
    React.createElement(LocaleContext.Provider, { value: ctx }, node)
  );
};

test('default sequence opens with a "Connect a service" step pointing at nav:connections', () => {
  const first = defaultSteps[0];
  assert.equal(
    first.id,
    'connect',
    'first tutorial step must introduce the Connections flow'
  );
  assert.equal(
    first.tutorialId,
    'nav:connections',
    'first step must anchor to the Connections nav entry'
  );
  assert.equal(typeof first.titleKey, 'string');
  assert.equal(typeof first.bodyKey, 'string');
});

test('every step that declares a tutorialId references a known target', () => {
  // Recognised data-tutorial-id values: nav:<id> for nav buttons,
  // connections:<provider> for provider cards.
  const knownPrefixes = ['nav:', 'connections:'];
  for (const step of defaultSteps) {
    if (!step.tutorialId) {
      continue;
    }
    assert.ok(
      knownPrefixes.some((p) => step.tutorialId.startsWith(p)),
      `tutorial step "${step.id}" tutorialId "${step.tutorialId}" must start with one of ${knownPrefixes.join(', ')}`
    );
  }
});

test('TutorialSpotlight renders an inset frame anchored to the target rect', () => {
  const html = renderInLocale(
    'en',
    React.createElement(TutorialSpotlight, {
      rect: { top: 100, left: 50, width: 200, height: 60 },
    })
  );
  assert.match(html, /class="tutorial-spotlight-frame"/);
  // The frame inset is computed from the rect.
  assert.match(html, /top:\s*100px/);
  assert.match(html, /left:\s*50px/);
  assert.match(html, /width:\s*200px/);
  assert.match(html, /height:\s*60px/);
});

test('TutorialSpotlight renders nothing when no rect is supplied', () => {
  const html = renderInLocale(
    'en',
    React.createElement(TutorialSpotlight, { rect: null })
  );
  assert.equal(html, '');
});

test('connect step copy is translated into ru/zh/hi (no English leak)', () => {
  const connect = defaultSteps[0];
  for (const locale of ['ru', 'zh', 'hi']) {
    const titleTpl = dictionaries[locale][connect.titleKey];
    const bodyTpl = dictionaries[locale][connect.bodyKey];
    assert.ok(
      typeof titleTpl === 'string' && titleTpl.length > 0,
      `${locale} missing ${connect.titleKey}`
    );
    assert.ok(
      typeof bodyTpl === 'string' && bodyTpl.length > 0,
      `${locale} missing ${connect.bodyKey}`
    );
    // The title must not be the English literal — that would mean the
    // step copy never reached this locale.
    assert.notEqual(
      titleTpl,
      dictionaries.en[connect.titleKey],
      `${locale} ${connect.titleKey} must be translated, not the English literal`
    );
  }
});
