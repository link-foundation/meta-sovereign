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

test('spotlight overlay CSS lets pointer events fall through to the spotlighted control', async () => {
  // Regression for the click pass-through bug found while taking issue
  // #25 PR screenshots: the fixed-position .tutorial-overlay-spotlight
  // div was swallowing taps on the very nav button the spotlight was
  // asking the user to tap. The overlay must declare
  // `pointer-events: none` and the dialog card must restore
  // `pointer-events: auto` so its Skip / Next / Off buttons stay clickable.
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const url = await import('node:url');
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const css = await fs.readFile(
    path.join(here, '..', 'src', 'web', 'app.css'),
    'utf8'
  );
  const overlayBlock = css.match(
    /\.tutorial-overlay-spotlight\s*\{[^}]*\}/
  )?.[0];
  assert.ok(overlayBlock, '.tutorial-overlay-spotlight rule must exist');
  assert.match(
    overlayBlock,
    /pointer-events:\s*none/,
    '.tutorial-overlay-spotlight must declare pointer-events: none so taps reach the spotlighted control'
  );
  const stepBlock = css.match(
    /\.tutorial-overlay-spotlight \.tutorial-step\s*\{[^}]*\}/
  )?.[0];
  assert.ok(
    stepBlock,
    '.tutorial-overlay-spotlight .tutorial-step rule must exist'
  );
  assert.match(
    stepBlock,
    /pointer-events:\s*auto/,
    '.tutorial-overlay-spotlight .tutorial-step must restore pointer-events: auto so the dialog buttons stay clickable'
  );
  // The dialog card must move to the top of the viewport when the
  // spotlight target is in the bottom half (e.g. mobile bottom-nav)
  // so the card does not visually cover its own anchor.
  assert.match(
    css,
    /\.tutorial-overlay-spotlight\[data-spotlight-side='top'\]\s*\{[^}]*align-items:\s*flex-start[^}]*\}/,
    'data-spotlight-side="top" must flip the overlay to align-items: flex-start'
  );
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
