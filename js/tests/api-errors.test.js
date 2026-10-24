// R-Z12: a server refusal is never swallowed. The uniform `{ok:false,error,
// code}` answer is logged once per distinct error, raises a localised toast
// for a user-triggered request with a systemic code, and a list that cannot
// load shows why with a retry button instead of loading forever.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  API_ERROR_EVENT,
  KNOWN_CODES,
  LoadError,
  errorText,
  failureOf,
  logOnce,
  reportApiFailure,
  resetApiErrors,
} from '../src/web/api-errors.js';
import { LocaleContext } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';

const watch = () => {
  const warned = [];
  const events = [];
  const warn = console.warn;
  const dispatch = globalThis.dispatchEvent;
  console.warn = (line) => warned.push(line);
  globalThis.dispatchEvent = (event) => events.push(event.detail);
  resetApiErrors();
  return {
    warned,
    events,
    stop: () => {
      console.warn = warn;
      globalThis.dispatchEvent = dispatch;
    },
  };
};

test('failureOf reads the uniform shape and server errors', () => {
  assert.deepEqual(
    failureOf(507, { ok: false, error: 'full', code: 'STORE_FULL' }),
    {
      code: 'STORE_FULL',
      error: 'full',
    }
  );
  assert.equal(failureOf(200, { ok: true }), null);
  assert.equal(failureOf(500, null).code, 'internal');
  assert.equal(failureOf(200, { items: [] }), null);
});

test('a failed user action is logged once and toasted; reads stay quiet', () => {
  const spy = watch();
  try {
    const body = { ok: false, error: 'disk full', code: 'STORE_FULL' };
    reportApiFailure({
      path: '/api/x',
      method: 'POST',
      status: 507,
      data: body,
    });
    reportApiFailure({
      path: '/api/x',
      method: 'POST',
      status: 507,
      data: body,
    });
    assert.equal(spy.warned.length, 1, 'once per distinct error');
    assert.equal(spy.events.length, 2, 'every failed action is shown');
    assert.equal(spy.events[0].code, 'STORE_FULL');

    reportApiFailure({
      path: '/api/y',
      method: 'GET',
      status: 500,
      data: null,
    });
    assert.equal(spy.warned.length, 2, 'a read is logged');
    assert.equal(spy.events.length, 2, 'but not shown');

    for (const code of ['unsupported', 'unsupported-chat', 'no-account']) {
      reportApiFailure({
        path: '/api/z',
        method: 'POST',
        status: 400,
        data: { ok: false, error: 'e', code },
      });
    }
    assert.equal(spy.events.length, 2, 'inline-only and panel codes: no toast');
    assert.equal(
      reportApiFailure({ path: '/a', status: 200, data: { ok: true } }),
      null
    );
  } finally {
    spy.stop();
  }
});

test('every common code has its own words in en, ru, hi and zh', () => {
  const t = (locale) => (key) => dictionaries[locale][key] ?? key;
  for (const code of KNOWN_CODES) {
    const texts = ['en', 'ru', 'hi', 'zh'].map((l) => {
      const text = errorText(t(l), code);
      assert.notEqual(
        text,
        dictionaries[l]['error.code.unknown'],
        `${l} ${code}`
      );
      return text;
    });
    assert.equal(new Set(texts).size, 4, `${code} differs per language`);
  }
  assert.equal(errorText(t('en'), 'weird', 'server words'), 'server words');
  assert.equal(errorText(t('en'), 'weird'), 'Something went wrong');
  for (const key of ['error.load', 'error.retry', 'settings.saveFailed']) {
    for (const l of ['en', 'ru', 'hi', 'zh']) {
      assert.ok(dictionaries[l][key], `${l} ${key}`);
    }
  }
});

test('a list that cannot load shows why, with a retry button', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      { value: { locale: 'en', t: (k) => dictionaries.en[k] ?? k } },
      React.createElement(LoadError, {
        error: Object.assign(new Error('boom'), { code: 'STORE_LOCKED' }),
        retry: () => {},
        what: 'chat',
      })
    )
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /data-load-error="chat"/);
  assert.match(html, /Could not load this list/);
  assert.match(html, /locked by another running copy/);
  assert.match(html, /data-action="load-retry"/);
});

test('logOnce logs a background failure once per distinct message', () => {
  const spy = watch();
  try {
    logOnce('poll', new Error('down'));
    logOnce('poll', new Error('down'));
    logOnce('poll', new Error('other'));
    assert.equal(spy.warned.length, 2);
    assert.equal(API_ERROR_EVENT, 'ms-api-error');
  } finally {
    spy.stop();
  }
});
