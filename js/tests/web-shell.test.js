// Issue #25 R-N1 / R-N2 / R-N11: AppShell renders the right primary-nav
// surface for compact / medium / expanded viewports, exposes the
// `connections` entry point, and uses the .glass token classes for the
// translucent surfaces.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  AppShell,
  COMPACT_PRIMARY,
  classifyViewport,
} from '../src/web/shell/app-shell.js';
import { Icon, iconNames } from '../src/web/icons.js';
import { navItems } from '../src/web/nav-items.js';
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

test('AppShell on phones: four primary sections, the rest under More', () => {
  const html = renderShell({ width: 390 });
  const bar = html.slice(html.indexOf('class="bottom-nav'));
  for (const id of COMPACT_PRIMARY) {
    assert.match(bar, new RegExp(`data-view="${id}"`));
  }
  assert.match(
    bar,
    /data-action="nav-more" aria-expanded="false" aria-controls="more-sheet"/
  );
  // Material 3 allows three to five destinations in a navigation bar.
  assert.equal((bar.match(/nav-item-bottom/g) ?? []).length, 5);
  // The sheet stays in the DOM (hidden) so every section is reachable.
  const sheet = html.slice(
    html.indexOf('id="more-sheet"'),
    html.indexOf('class="bottom-nav')
  );
  assert.match(html, /id="more-sheet"[^>]*hidden/);
  const rest = navItems.filter(([id]) => !COMPACT_PRIMARY.includes(id));
  for (const [id] of rest) {
    assert.match(sheet, new RegExp(`data-view="${id}"`));
  }
});

test('Nav items: every section has an icon and a visible label', () => {
  for (const [id] of navItems) {
    assert.ok(iconNames.includes(id), `missing icon for ${id}`);
  }
  const html = renderShell({ width: 1280 });
  assert.equal(
    (html.match(/<svg class="icon icon-/g) ?? []).length,
    navItems.length
  );
  assert.match(html, /<span class="nav-label">Connections<\/span>/);
  const svg = renderToStaticMarkup(React.createElement(Icon, { name: 'send' }));
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /focusable="false"/);
  assert.match(svg, /stroke="currentColor"/);
});

test('app.css: phones stack tables and forms instead of cutting them off', () => {
  const css = readFileSync(
    new URL('../src/web/app.css', import.meta.url),
    'utf8'
  );
  // Each phone rule must sit inside a compact-width media query.
  const phone = css
    .split('@media (max-width: 640px)')
    .slice(1)
    .map((block) => block.slice(0, block.indexOf('\n}\n')))
    .join('\n');
  assert.match(
    phone,
    /\.stack-table td::before \{\s*content: attr\(data-label\)/
  );
  assert.match(phone, /\.stack-table td\[data-title\] \{\s*order: -1/);
  assert.match(phone, /\.row > \.narrow \{\s*flex-basis: 100%/);
  // A wrapped radio label keeps its radio on the first line.
  assert.match(css, /\.appearance \.check \{[^}]*align-items: flex-start/);
  // Key/value tables keep values near their keys.
  assert.match(css, /\.kv-table \{\s*max-width: 32rem/);
});

test('AppShell on phones and tablets: a locale may shorten nav labels', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale: 'ru',
          t: (key) => dictionaries.ru[key] ?? key,
          setLocale: () => {},
          clearLocale: () => {},
          available: availableLocales,
        },
      },
      React.createElement(AppShell, {
        width: 390,
        active: 'chat',
        onSelect: () => {},
        children: null,
      })
    )
  );
  const bar = html.slice(html.indexOf('class="bottom-nav'));
  const sheet = html.slice(0, html.indexOf('class="bottom-nav'));
  // "Автоматизация" does not fit a ~70 px slot; the bar says "Сценарии"
  // and keeps the full name as the tooltip.
  assert.match(
    bar,
    /data-view="automation"[^>]*title="Автоматизация"[^>]*>.*?<span class="nav-label">Сценарии<\/span>/
  );
  assert.ok(!sheet.includes('Сценарии'), 'the More sheet keeps full names');
  for (const [id] of navItems) {
    const short = dictionaries.ru[`nav.short.${id}`];
    if (short) {
      assert.ok(short.length <= 9, `${id}: "${short}" is too long`);
    }
  }
});
