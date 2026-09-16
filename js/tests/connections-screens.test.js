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

// Issue #29: Naukri, VietnamWorks and TopCV publish no API. Their detail
// screen must therefore render a browser-session panel — sign-in links and
// a jump to the CV screen — instead of a credential form and a probe that
// could never succeed.
test('browser-only providers render a session panel instead of a probe', () => {
  for (const id of ['naukri', 'vietnamworks', 'topcv']) {
    assert.equal(
      classifyConnectionState({ savedSecretIds: [] }, id),
      'browser-session',
      `"${id}" has no credential to classify`
    );
    const html = renderInLocale(
      'en',
      React.createElement(ConnectionDetail, {
        providerId: id,
        status: { savedSecretIds: [] },
        links: [],
        refresh: async () => {},
        onBack: () => {},
      })
    );
    const session = providerCatalogue[id].session;
    assert.ok(
      html.includes('data-browser-only="true"'),
      `"${id}" detail must mark itself browser-only`
    );
    assert.ok(
      html.includes(`href="${session.loginUrl.replace(/&/g, '&amp;')}"`),
      `"${id}" detail must link to the sign-in page`
    );
    assert.ok(
      html.includes(`href="${session.profileUrl}"`),
      `"${id}" detail must link to the profile page`
    );
    assert.ok(
      html.includes(`data-target-platform="${id}"`),
      `"${id}" detail must offer a jump to the CV screen`
    );
    // The archive import survives: exported message dumps still parse.
    assert.ok(
      html.includes('data-action="archive-file"'),
      `"${id}" detail keeps the archive import`
    );
    assert.ok(
      !html.includes('data-action="probe"'),
      `"${id}" must not offer a probe against an API that does not exist`
    );
    assert.ok(
      !html.includes('data-field-input='),
      `"${id}" must not ask for credentials`
    );
    assert.ok(
      html.includes('browser-commander'),
      `"${id}" detail must point at the driver docs`
    );
  }
});

test('the browser-session state badge is translated in every locale', () => {
  for (const locale of availableLocales) {
    const label =
      dictionaries[locale.id ?? locale]?.['connections.state.browserSession'];
    assert.equal(
      typeof label,
      'string',
      `locale "${locale.id ?? locale}" must translate the browser-session badge`
    );
  }
});
