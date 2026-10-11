// Issue #31 / R-W7: the re-engage screen. `ReengageScreen` is pure, so
// rendering it server-side with a plan built from real message links
// exercises the whole surface — the draft, the detected form and its
// evidence, the safe-mode switch, notices and progress — without a
// browser, and in every locale the SPA ships.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  ReengageScreen,
  ReengageView,
  combinedProgress,
  serverSender,
} from '../src/web/reengage-view.js';
import { navItems } from '../src/web/nav-items.js';
import { views } from '../src/web/views.js';
import { LocaleContext, availableLocales } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';
import { buildMessageLink } from '../src/sources/link.js';
import { DAY_MS, planReengagement } from '../src/crm/reengage.js';
import { api } from '../src/web/dom.js';

const NOW = '2026-10-01T00:00:00Z';
const ago = (n) => new Date(Date.parse(NOW) - n * DAY_MS).toISOString();

const plan = () => {
  let id = 0;
  const links = [
    ['101', 'me', 'Привет, как ты?', 130],
    ['101', 'alice', 'Норм, а ты?', 120],
    ['102', 'me', 'Здравствуйте, вы сможете помочь?', 200],
    ['102', 'bob', 'Да', 200],
  ].map(([chat, sender, body, days]) =>
    buildMessageLink({
      source: 'vk',
      externalId: String((id += 1)),
      sender,
      chat,
      body,
      timestamp: ago(days),
    })
  );
  return planReengagement(links, { now: NOW });
};

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

const baseState = (overrides = {}) => {
  const p = plan();
  return {
    days: 90,
    plan: p,
    current: p.drafts[0],
    progress: {
      total: p.drafts.length,
      position: 0,
      remaining: p.drafts.length,
      done: false,
      sent: 0,
      skipped: 0,
      failed: 0,
    },
    safe: true,
    busy: '',
    notice: null,
    ...overrides,
  };
};

const render = (state, locale = 'en') =>
  renderInLocale(locale, React.createElement(ReengageScreen, { state }));

test('the re-engage screen is a registered nav surface', () => {
  assert.ok(
    navItems.some(([id, key]) => id === 'reengage' && key === 'nav.reengage')
  );
  assert.equal(views.reengage, ReengageView);
});

test('the current draft shows the contact, the silence and the detected form', () => {
  const state = baseState();
  const html = render(state);
  assert.match(html, /2 personal contact\(s\) silent for ≥ 90 days/);
  assert.match(html, /1\/2: alice \(vk\)/);
  assert.match(html, /Silent for \d+ days · 2 messages/);
  assert.match(html, /data-form="informal"/);
  assert.match(html, /Form of address: informal \(&quot;ты&quot;\)/);
  assert.match(html, /data-form-reason="majority"/);
  assert.match(html, /Тебе или твоим друзьям/);
  assert.match(html, /Switch to formal/);
  // VK opens the dialog; the text itself still has to be pasted.
  assert.match(html, /href="https:\/\/vk\.com\/im\?sel=101"/);
  assert.match(html, />Open chat</);
  for (const action of ['send', 'copy', 'switch-form', 'mark-sent', 'skip']) {
    assert.match(html, new RegExp(`data-action="reengage-${action}"`));
  }
});

test('safe mode is on by default and hides "Send all"', () => {
  const html = render(baseState());
  assert.match(html, /data-safe-mode="true"/);
  assert.match(html, /type="checkbox"[^>]*checked=""/);
  assert.doesNotMatch(html, /reengage-send-all/);
});

test('turning safe mode off reveals "Send all" with the count left', () => {
  const html = render(baseState({ safe: false }));
  assert.match(html, /data-action="reengage-send-all"[^>]*>Send all \(2\)</);
});

test('an empty draft cannot be sent', () => {
  const state = baseState();
  const html = render({ ...state, current: { ...state.current, text: ' ' } });
  assert.match(html, /data-action="reengage-send"[^>]*disabled/);
});

test('an empty plan and a finished plan say so', () => {
  const empty = render(
    baseState({
      plan: { ...plan(), total: 0, drafts: [] },
      current: null,
    })
  );
  assert.match(empty, /data-reengage="empty"/);
  assert.match(empty, /No personal contact has been silent for 90 days/);
  const done = render(baseState({ current: null }));
  assert.match(done, /data-reengage="done"/);
});

test('a failed send is an alert that keeps the error', () => {
  const html = render(
    baseState({ notice: { status: 'failed', error: 'blocked by privacy' } })
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Not sent: blocked by privacy\./);
});

test('a manual send is acknowledged as such', () => {
  const html = render(
    baseState({ notice: { status: 'sent', manual: true, error: null } })
  );
  assert.match(html, /data-notice="manual"/);
});

test('every locale translates the re-engage screen', () => {
  for (const { id } of availableLocales) {
    for (const state of [
      baseState(),
      baseState({ safe: false, notice: { status: 'skipped' } }),
    ]) {
      const html = render(state, id);
      assert.doesNotMatch(html, /reengage\.[a-zA-Z.-]+/, `${id}: raw key`);
    }
  }
});

test('the sender turns a refused or missing server into a thrown error', async () => {
  const sent = serverSender({
    reengageSend: async () => ({ status: 'sent', record: { result: 7 } }),
  });
  assert.equal(await sent({}), 7);
  const refused = serverSender({
    reengageSend: async () => ({ status: 'failed', error: 'blocked' }),
  });
  await assert.rejects(refused({}), /blocked/);
  const offline = serverSender({ reengageSend: async () => null });
  await assert.rejects(offline({}), /not sent/);
});

test('progress carries over when safe mode hands drafts to a new session', () => {
  const merged = combinedProgress(
    { position: 2, sent: 1, skipped: 1, failed: 0 },
    {
      total: 3,
      position: 1,
      remaining: 2,
      done: false,
      sent: 0,
      skipped: 0,
      failed: 1,
    }
  );
  assert.deepEqual(merged, {
    total: 5,
    position: 3,
    remaining: 2,
    done: false,
    sent: 1,
    skipped: 1,
    failed: 1,
  });
});

test('offline, the client says sending needs the server', async () => {
  const answer = await api.reengageSend(plan().drafts[0]);
  assert.equal(answer.code, 'server-required');
});
