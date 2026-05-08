// Issue #25: ConnectionGuide must render the active locale's strings
// instead of the registry's English literals. Renders <ConnectionGuide
// section="chat"> inside a Russian LocaleContext and asserts the visible
// text is the Russian translation, not the English registry copy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConnectionGuide } from '../src/web/connection-guide.js';
import { connectionGuides } from '../src/web/connection-guides.js';
import { LocaleContext } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';

const renderInLocale = (locale, node) => {
  const t = (key, vars) => {
    const dict = dictionaries[locale];
    const fallback = dictionaries.en;
    const tpl = dict?.[key] ?? fallback?.[key] ?? key;
    if (!vars) {
      return tpl;
    }
    return String(tpl).replace(/\{(\w+)\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
    );
  };
  return renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale,
          t,
          setLocale: () => {},
          clearLocale: () => {},
          available: [],
        },
      },
      node
    )
  );
};

test('ConnectionGuide chat surface renders Russian copy when locale=ru', () => {
  const html = renderInLocale(
    'ru',
    React.createElement(ConnectionGuide, { section: 'chat' })
  );
  assert.ok(
    html.includes(dictionaries.ru['guide.chat.title']),
    'Russian guide.chat.title must appear in the rendered markup'
  );
  // The English registry literal must NOT leak into the Russian render.
  assert.ok(
    !html.includes(connectionGuides.chat.title),
    `English '${connectionGuides.chat.title}' must not leak into the ru render`
  );
});

test('ConnectionGuide renders a compact Connections CTA instead of provider cards', () => {
  const html = renderInLocale(
    'zh',
    React.createElement(ConnectionGuide, { section: 'chat' })
  );
  assert.ok(
    html.includes(dictionaries.zh['guide.chat.title']),
    'Chinese guide.chat.title must render'
  );
  assert.ok(
    html.includes('data-action="open-connections"'),
    'empty data sections must link to the dedicated Connections screen'
  );
  assert.ok(
    !html.includes('connection-guide-provider'),
    'empty data sections must not repeat provider setup cards inline'
  );
});

test('ConnectionGuide does not render archive or probe setup controls inline', () => {
  const html = renderInLocale(
    'hi',
    React.createElement(ConnectionGuide, { section: 'chat' })
  );
  assert.ok(
    !html.includes('data-action="archive-file"'),
    'archive import belongs on the provider detail page'
  );
  assert.ok(
    !html.includes('data-action="probe"'),
    'live probing belongs on the provider detail page'
  );
});
