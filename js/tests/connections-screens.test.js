// Issue #25 R-N4..R-N8: Connections module renders one card per
// catalogued provider, surfaces a translated state badge, hands the
// detail screen a translated setupSteps[] sequence, and wires the
// "Open detail" affordance to a navigation callback.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  ConnectionsList,
  ConnectionDetail,
  classifyConnectionState,
} from '../src/web/connections/index.js';
import { providerCatalogue } from '../src/web/connection-guides.js';
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

test('classifyConnectionState reports connected/not-connected/action-required', () => {
  // Saved credential → connected.
  assert.equal(
    classifyConnectionState(
      { savedSecretIds: ['secret:email:access-token'] },
      'email'
    ),
    'connected'
  );
  // Last probe failed → action-required.
  assert.equal(
    classifyConnectionState(
      { savedSecretIds: [], lastProbe: { providerId: 'email', ok: false } },
      'email'
    ),
    'action-required'
  );
  // Nothing saved, no failed probe → not-connected.
  assert.equal(
    classifyConnectionState({ savedSecretIds: [] }, 'email'),
    'not-connected'
  );
});

test('ConnectionsList renders one card per provider with translated label and state badge', () => {
  const html = renderInLocale(
    'ru',
    React.createElement(ConnectionsList, {
      status: { savedSecretIds: [] },
      onOpen: () => {},
    })
  );
  for (const id of Object.keys(providerCatalogue)) {
    assert.match(
      html,
      new RegExp(`data-provider-id="${id}"`),
      `card for "${id}" must render`
    );
  }
  // Every "not-connected" card shows the translated state label.
  assert.ok(
    html.includes(dictionaries.ru['connections.state.notConnected']),
    'translated "not connected" state badge must appear'
  );
});

test('ConnectionDetail renders translated setupSteps[] for the requested provider', () => {
  const html = renderInLocale(
    'zh',
    React.createElement(ConnectionDetail, {
      providerId: 'telegram',
      status: { savedSecretIds: [] },
      links: [],
      refresh: async () => {},
      onBack: () => {},
    })
  );
  // Each step has a translated title & body.
  assert.ok(
    html.includes(dictionaries.zh['connections.telegram.setup.step1.title']),
    'first telegram setup step title must appear in zh'
  );
});

test('ConnectionDetail owns credentials, archive import, and probe controls', () => {
  const html = renderInLocale(
    'en',
    React.createElement(ConnectionDetail, {
      providerId: 'telegram',
      status: { savedSecretIds: [] },
      links: [],
      refresh: async () => {},
      onBack: () => {},
    })
  );
  assert.ok(
    html.includes('data-field-input="token"'),
    'telegram token input must live on the provider detail page'
  );
  assert.ok(
    html.includes('data-action="archive-file"'),
    'archive file import must live on the provider detail page'
  );
  assert.ok(
    html.includes('data-action="archive-import"'),
    'pasted archive import must live on the provider detail page'
  );
  assert.ok(
    html.includes('data-action="probe"'),
    'direct probe must live on the provider detail page'
  );
});

test('every provider in providerCatalogue has at least one setupSteps[] entry', async () => {
  const { providerSetupSteps } =
    await import('../src/web/connections/setup-steps.js');
  for (const id of Object.keys(providerCatalogue)) {
    const steps = providerSetupSteps[id];
    assert.ok(
      Array.isArray(steps),
      `provider "${id}" must declare setupSteps[]`
    );
    assert.ok(steps.length > 0, `provider "${id}" must have at least one step`);
    for (const step of steps) {
      assert.equal(
        typeof step.titleKey,
        'string',
        `step in "${id}" missing titleKey`
      );
      assert.equal(
        typeof step.bodyKey,
        'string',
        `step in "${id}" missing bodyKey`
      );
    }
  }
});
