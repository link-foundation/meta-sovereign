// Issue #35: the Greetings screen. `GreetingsScreen` is pure, so
// rendering it server-side with a hand-built state exercises the whole
// surface — sticker grid with direct previews, Telegram sets, the plan
// preview, send results and failures — without a browser, in every
// locale the SPA ships.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  GreetingsScreen,
  GreetingsView,
  clientFailure,
  offeredStickers,
  stickerKey,
} from '../src/web/greetings-view.js';
import { navItems } from '../src/web/nav-items.js';
import { views } from '../src/web/views.js';
import { connectionGuides } from '../src/web/connection-guides.js';
import { LocaleContext, availableLocales } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';
import {
  defaultGreetingSelection,
  greetingCatalogue,
  vkGreetingStickers,
} from '../src/greetings/index.js';

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

const liveTelegram = {
  network: 'telegram',
  id: 'CAACAgIAAxkBAAE',
  pack: 'UtyaDuck',
  emoji: '👋',
  previewUrl: '/api/greetings/file?id=AAMCAgADGQ',
};

const baseState = (overrides = {}) => ({
  catalogue: greetingCatalogue(),
  selection: defaultGreetingSelection(),
  dirty: false,
  saved: false,
  live: [liveTelegram],
  busy: '',
  failures: [],
  mode: 'initiate',
  delaySeconds: 30,
  plan: null,
  results: null,
  update: () => {},
  toggleSticker: () => {},
  toggleSet: () => {},
  listLive: () => {},
  save: () => {},
  setMode: () => {},
  setDelaySeconds: () => {},
  preview: () => {},
  send: () => {},
  ...overrides,
});

const render = (state, locale = 'en') =>
  renderInLocale(locale, React.createElement(GreetingsScreen, { state }));

const plan = {
  mode: 'initiate',
  envelopes: [
    {
      network: 'vk',
      chat: '100',
      contact: '100',
      language: 'en',
      kind: 'sticker',
      sticker: vkGreetingStickers[0],
      text: null,
    },
    {
      network: 'whatsapp',
      chat: '1555',
      contact: '1555',
      language: 'en',
      kind: null,
      sticker: null,
      text: null,
      skipped: 'outside-messaging-window',
    },
  ],
};

test('the Greetings screen is a registered nav surface with a guide', () => {
  assert.ok(
    navItems.some(([id, key]) => id === 'greetings' && key === 'nav.greetings')
  );
  assert.equal(views.greetings, GreetingsView);
  assert.equal(connectionGuides.greetings.titleKey, 'guide.greetings.title');
});

// Deno and Bun run this suite too, but only Node's own binary takes the
// V8 flag below.
const onNode = !globalThis.Deno && !globalThis.Bun;

test('the screens load under a CSP without unsafe-eval', () => {
  // The SPA's CSP forbids string evaluation. Some network adapters call
  // `new Function` when their module loads, so if the screens pull the
  // adapters in (as `greetings/index.js` would), the whole app fails to
  // start. Node's flag applies the same rule.
  if (!onNode) {
    return;
  }
  const views = new URL('../src/web/views.js', import.meta.url).href;
  const out = execFileSync(
    process.execPath,
    [
      '--disallow-code-generation-from-strings',
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(views)}); console.log('loaded');`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  assert.match(out, /loaded/);
});

test('every locale names the screen and its controls', () => {
  for (const locale of Object.keys(dictionaries)) {
    for (const key of ['nav.greetings', 'greetings.title', 'greetings.send']) {
      assert.ok(dictionaries[locale][key], `${locale} is missing ${key}`);
    }
  }
});

test('offers built-in, live and previously picked stickers once each', () => {
  const picked = { network: 'vk', id: '999', previewUrl: null };
  const stickers = offeredStickers({
    catalogue: greetingCatalogue(),
    live: [liveTelegram, { ...vkGreetingStickers[0], emoji: '👋' }],
    selection: { stickers: [picked, vkGreetingStickers[0]] },
  });
  const keys = stickers.map(stickerKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('telegram:CAACAgIAAxkBAAE'));
  assert.ok(keys.includes('vk:999'));
  // A live listing enriches the built-in entry instead of duplicating it.
  assert.equal(
    stickers.find((s) => s.id === vkGreetingStickers[0].id).emoji,
    '👋'
  );
});

test('renders sticker cards from direct links only', () => {
  const html = render(baseState());
  for (const sticker of vkGreetingStickers) {
    assert.ok(html.includes(`data-sticker="vk:${sticker.id}"`));
    assert.ok(html.includes(`src="${sticker.previewUrl}"`));
  }
  assert.ok(html.includes('src="/api/greetings/file?id=AAMCAgADGQ"'));
  // Every picture is a vk.com link or the server's thumbnail proxy.
  const sources = [...html.matchAll(/<img[^>]* src="([^"]+)"/g)].map(
    (m) => m[1]
  );
  assert.ok(sources.length > 0);
  for (const src of sources) {
    assert.match(src, /^(https:\/\/vk\.com\/sticker\/|\/api\/greetings\/file)/);
  }
  // The Messenger thumbs-up has no preview, so it shows its emoji.
  assert.ok(html.includes('data-sticker="facebook:369239263222822"'));
  assert.ok(html.includes('👍'));
});

test('marks picked stickers and lists Telegram sets with t.me links', () => {
  const html = render(
    baseState({
      selection: {
        ...defaultGreetingSelection(),
        stickers: [vkGreetingStickers[1]],
        telegramSets: ['UtyaDuck'],
      },
    })
  );
  assert.ok(
    html.includes(
      `class="greetings-sticker selected" data-sticker="vk:${vkGreetingStickers[1].id}"`
    )
  );
  assert.ok(html.includes('href="https://t.me/addstickers/UtyaDuck"'));
  assert.ok(html.includes('messages.getStickers'));
});

test('shows a plan with skipped chats and per-chat send results', () => {
  const html = render(
    baseState({
      plan,
      results: [{ ...plan.envelopes[0], ok: false, error: 'vk API 901' }],
    })
  );
  assert.ok(html.includes('data-chat="vk:100"'));
  assert.ok(html.includes('data-skipped="outside-messaging-window"'));
  assert.ok(html.includes('skipped: outside-messaging-window'));
  assert.ok(html.includes('! vk API 901'));
  const sendButton = html.match(
    /<button[^>]*data-action="greetings-send"[^>]*>/
  );
  assert.ok(sendButton && !sendButton[0].includes('disabled'));
});

test('keeps sending disabled until a plan has someone to greet', () => {
  for (const state of [
    baseState(),
    baseState({ plan: { mode: 'reply', envelopes: [plan.envelopes[1]] } }),
  ]) {
    const button = render(state).match(
      /<button[^>]*data-action="greetings-send"[^>]*>/
    );
    assert.ok(button[0].includes('disabled'));
  }
  assert.ok(
    render(baseState({ plan: { mode: 'reply', envelopes: [] } })).includes(
      'Nobody to greet'
    )
  );
});

test('shows network capabilities, including networks without stickers', () => {
  const html = render(baseState());
  assert.ok(html.includes('data-network="x"'));
  assert.ok(html.includes('within 24 h of their last message'));
  assert.ok(html.includes('replies only'));
});

test('reports failures, including server-required ones, as an alert', () => {
  const html = render(
    baseState({
      failures: [
        { network: 'vk,telegram', error: 'server-required' },
        clientFailure('save', new Error('quota exceeded')),
      ],
    })
  );
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('vk,telegram: server-required'));
  assert.ok(html.includes('save: quota exceeded'));
});

test('renders in every locale without falling back to raw keys', () => {
  for (const locale of Object.keys(dictionaries)) {
    const html = render(baseState({ plan, saved: true }), locale);
    assert.ok(html.includes(dictionaries[locale]['greetings.title']));
    assert.ok(!/greetings\.[a-z]/i.test(html), `${locale} leaks a raw key`);
  }
});

test('the view loads the catalogue and selection through the api', () => {
  const api = {
    greetingCatalogue: async () => greetingCatalogue(),
    greetingSelection: async () => defaultGreetingSelection(),
  };
  const html = renderInLocale(
    'en',
    React.createElement(GreetingsView, { api })
  );
  // Effects do not run during SSR: the first paint is the empty shell.
  assert.ok(html.includes('Greetings'));
  assert.ok(html.includes('No plan yet'));
});
