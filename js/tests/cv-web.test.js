// Issue #29 / R-V18: the CV screen. `CvScreen` is pure, so rendering it
// server-side with a hand-built state exercises the whole surface —
// catalogue, snapshots, conflicts, sync plan, telemetry and failures —
// without a browser, and in every locale the SPA ships.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CvScreen, CvView } from '../src/web/cv-view.js';
import { navItems } from '../src/web/nav-items.js';
import { views } from '../src/web/views.js';
import { LocaleContext, availableLocales } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';
import { listCvPlatforms } from '../src/cv/index.js';
import { api } from '../src/web/dom.js';

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

const baseState = (overrides = {}) => ({
  platforms: [
    {
      id: 'habr-career',
      label: 'Habr Career',
      markupAccess: 'verified',
      confidence: { verified: 7, draft: 2 },
    },
    {
      id: 'topcv',
      label: 'TopCV',
      markupAccess: 'draft',
      confidence: { verified: 0, draft: 9 },
    },
  ],
  stored: [],
  selected: ['habr-career'],
  busy: '',
  failures: [],
  comparison: null,
  sync: null,
  telemetry: null,
  toggle: () => {},
  read: () => {},
  compare: () => {},
  planSync: () => {},
  ...overrides,
});

const render = (state, locale = 'en') =>
  renderInLocale(locale, React.createElement(CvScreen, { state }));

test('the CV screen is a registered nav surface', () => {
  assert.ok(
    navItems.some(([id, key]) => id === 'cv' && key === 'nav.cv'),
    'navItems is missing the cv surface'
  );
  assert.equal(views.cv, CvView);
});

test('the catalogue renders one row per platform with its plan confidence', () => {
  const html = render(baseState());
  assert.match(html, /data-platform="habr-career"/);
  assert.match(html, /data-platform="topcv"/);
  assert.match(html, /7 verified \/ 2 draft/);
  assert.match(html, /never read/);
  for (const action of ['read', 'compare', 'plan-sync', 'apply-sync']) {
    assert.match(html, new RegExp(`data-action="cv-${action}"`));
  }
  // Nothing may be written before a dry run has been planned.
  assert.match(html, /data-action="cv-apply-sync"[^>]*disabled/);
});

test('a stored snapshot replaces the "never read" marker', () => {
  const html = render(
    baseState({
      stored: [
        {
          platform: 'habr-career',
          capturedAt: '2026-01-02T03:04:05.000Z',
          cv: {},
        },
      ],
    })
  );
  assert.doesNotMatch(
    html.split('data-platform="topcv"')[0],
    /never read/,
    'the read platform still claims it was never read'
  );
});

test('conflicting fields are listed and agreeing ones are not', () => {
  const html = render(
    baseState({
      comparison: {
        comparison: {
          rows: [
            {
              path: 'basics.name',
              conflict: true,
              missing: ['topcv'],
              values: { 'habr-career': 'Anna', linkedin: 'Anna B.' },
            },
            { path: 'basics.city', conflict: false, missing: [], values: {} },
          ],
        },
      },
    })
  );
  assert.match(html, /data-path="basics\.name" data-conflict="true"/);
  assert.doesNotMatch(html, /data-path="basics\.city"/);
  assert.match(html, /habr-career: &quot;Anna&quot;/);
  assert.match(html, /topcv/);
});

test('an empty comparison says so instead of rendering an empty table', () => {
  const html = render(baseState({ comparison: { comparison: { rows: [] } } }));
  assert.match(html, /No conflicts/);
});

test('a dry run is labelled as such and lists its per-platform actions', () => {
  const html = render(
    baseState({
      sync: {
        dryRun: true,
        actions: [
          {
            platform: 'habr-career',
            writable: 2,
            unsupported: 1,
            paths: ['basics.name'],
          },
        ],
      },
    })
  );
  assert.match(html, /data-dry-run="true"/);
  assert.match(html, /nothing was written/);
  assert.match(html, /2 writable, 1 unsupported — basics\.name/);
});

test('failures name the platform, the code and the message', () => {
  const html = render(
    baseState({
      failures: [
        {
          platform: 'topcv',
          code: 'browser-unavailable',
          message: 'install playwright',
        },
      ],
    })
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /topcv: browser-unavailable — install playwright/);
});

test('telemetry runs surface their counts and problems', () => {
  const html = render(
    baseState({
      telemetry: {
        runs: [
          {
            runId: 'run-1',
            platform: 'habr-career',
            mode: 'read',
            startedAt: '2026-01-02T03:04:05.000Z',
            counts: { 'run.start': 1, 'markup.fingerprint': 3 },
            problems: ['selector .page-title__title matched 0 nodes'],
          },
        ],
        events: [],
      },
    })
  );
  assert.match(html, /data-run-id="run-1"/);
  assert.match(html, /run\.start=1 markup\.fingerprint=3/);
  assert.match(html, /matched 0 nodes/);
});

test('an idle telemetry panel explains that no run happened yet', () => {
  assert.match(render(baseState()), /No runs recorded yet/);
});

test('every locale translates the CV screen', () => {
  for (const { id } of availableLocales) {
    const html = render(baseState(), id);
    assert.doesNotMatch(html, /cv\.[a-zA-Z]+</, `${id}: untranslated cv key`);
    assert.doesNotMatch(html, />nav\.cv</, `${id}: untranslated nav key`);
  }
});

test('each locale defines every key the CV screen and nav use', () => {
  const keys = Object.keys(dictionaries.en).filter(
    (key) => key === 'nav.cv' || key.startsWith('cv.')
  );
  assert.ok(keys.length > 20, 'expected the cv.* key block in en');
  for (const { id } of availableLocales) {
    for (const key of keys) {
      assert.ok(dictionaries[id][key], `${id} is missing ${key}`);
    }
  }
});

test('the offline client answers every CV call the screen makes', async () => {
  for (const method of [
    'cvPlatforms',
    'cvPlan',
    'cvStored',
    'cvRead',
    'cvCompare',
    'cvSync',
    'cvTelemetry',
  ]) {
    assert.equal(typeof api[method], 'function', `api.${method} is missing`);
  }
  // Without a server the calls resolve to an honest "server-required"
  // answer rather than throwing at the user.
  const read = await api.cvRead({ platforms: ['topcv'] });
  assert.equal(read.failures[0].code, 'server-required');
  const stored = await api.cvStored();
  assert.deepEqual(stored.entries, []);
  const telemetry = await api.cvTelemetry({});
  assert.deepEqual(telemetry.runs, []);
});

test('the catalogue covers every platform the CV subsystem knows', () => {
  const ids = listCvPlatforms();
  for (const id of [
    'linkedin',
    'hh',
    'habr-career',
    'naukri',
    'vietnamworks',
    'topcv',
  ]) {
    assert.ok(ids.includes(id), `missing platform ${id}`);
  }
});
