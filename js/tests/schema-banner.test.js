// The page banner for a store from a newer version (R-Z17).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LocaleContext } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';
import { SchemaBanner, schemaTooNew } from '../src/web/schema-banner.js';

const render = (props, locale = 'en') => {
  const t = (key) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  return renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      { value: { locale, t, setLocale: () => {}, available: [] } },
      React.createElement(SchemaBanner, props)
    )
  );
};

test('health says the store is newer only when its version is above the current one', () => {
  assert.equal(schemaTooNew({ schema: { version: 2, current: 1 } }), true);
  assert.equal(schemaTooNew({ schema: { version: 1, current: 1 } }), false);
  assert.equal(schemaTooNew({ schema: { version: 0, current: 1 } }), false);
  assert.equal(schemaTooNew({}), false);
  assert.equal(schemaTooNew(null), false);
});

test('the banner shows for a newer server store or page store, in all four languages', () => {
  const newer = { health: { schema: { version: 5, current: 1 } } };
  assert.match(
    render(newer),
    /This data was saved by a newer version of the app\. Update the app to keep using it\./
  );
  assert.match(render({ tooNew: true }), /data-banner="schema-too-new"/);
  assert.equal(render({ health: { schema: { version: 1, current: 1 } } }), '');
  const seen = new Set();
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const text = dictionaries[locale]['schema.tooNew'];
    assert.ok(text && !seen.has(text), `${locale} has its own text`);
    seen.add(text);
    assert.ok(render(newer, locale).includes(text));
  }
});
