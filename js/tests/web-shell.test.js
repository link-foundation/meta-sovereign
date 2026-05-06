// Issue #25 R-N1 / R-N2 / R-N11: AppShell renders the right primary-nav
// surface for compact / medium / expanded viewports, exposes the
// `connections` entry point, and uses the .glass token classes for the
// translucent surfaces.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AppShell, classifyViewport } from '../src/web/shell/app-shell.js';
import { LocaleContext, availableLocales } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';

const renderShell = ({ width, active = 'chat' }) => {
  const ctx = {
    locale: 'en',
    t: (key, vars) => {
      const tpl = dictionaries.en[key] ?? key;
      if (!vars) {
        return tpl;
      }
      return String(tpl).replace(/\{(\w+)\}/g, (m, name) =>
        Object.prototype.hasOwnProperty.call(vars, name)
          ? String(vars[name])
          : m
      );
    },
    setLocale: () => {},
    clearLocale: () => {},
    available: availableLocales,
  };
  return renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      { value: ctx },
      React.createElement(AppShell, {
        width,
        active,
        onSelect: () => {},
        children: React.createElement('main', null, 'view'),
      })
    )
  );
};

test('classifyViewport: ≤640 → compact, 641-1023 → medium, ≥1024 → expanded', () => {
  assert.equal(classifyViewport(320), 'compact');
  assert.equal(classifyViewport(640), 'compact');
  assert.equal(classifyViewport(641), 'medium');
  assert.equal(classifyViewport(1023), 'medium');
  assert.equal(classifyViewport(1024), 'expanded');
  assert.equal(classifyViewport(1440), 'expanded');
});

test('AppShell at 320px renders a bottom-nav with role=navigation', () => {
  const html = renderShell({ width: 320 });
  assert.match(html, /class="[^"]*\bbottom-nav\b/);
  assert.match(html, /role="navigation"/);
  // No side rail at compact widths.
  assert.ok(!/side-rail/.test(html), 'compact must not render the side rail');
  assert.ok(
    !/permanent-drawer/.test(html),
    'compact must not render the drawer'
  );
});

test('AppShell at 768px renders a navigation rail (no bottom-nav)', () => {
  const html = renderShell({ width: 768 });
  assert.match(html, /side-rail/);
  assert.ok(
    !/\bbottom-nav\b/.test(html),
    'medium must not render the bottom nav'
  );
});

test('AppShell at 1280px renders a permanent drawer (no bottom-nav, no rail)', () => {
  const html = renderShell({ width: 1280 });
  assert.match(html, /permanent-drawer/);
  assert.ok(
    !/\bbottom-nav\b/.test(html),
    'expanded must not render the bottom nav'
  );
  assert.ok(!/side-rail/.test(html), 'expanded must not render the side rail');
});

test('AppShell exposes a Connections entry in the primary nav', () => {
  const html = renderShell({ width: 1280 });
  // The translated label for the Connections entry.
  assert.ok(
    html.includes(dictionaries.en['nav.connections']),
    'the Connections entry must render in the primary nav'
  );
});

test('AppShell topbar uses the glass surface class (R-N11)', () => {
  const html = renderShell({ width: 1280 });
  assert.match(html, /class="[^"]*\bglass\b/);
});

test('AppShell marks the active nav button via aria-current=page', () => {
  const html = renderShell({ width: 320, active: 'settings' });
  // The active button gets aria-current="page" so screen readers
  // announce the current view.
  assert.match(
    html,
    /<button[^>]*data-view="settings"[^>]*aria-current="page"/
  );
});
