import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_ROUTE_KEY,
  chatHash,
  createAppNavigation,
  operatorHash,
  parseAppRoute,
} from '../src/web/app-route.js';
import { navItems } from '../src/web/nav-items.js';

const browser = (hash = '', saved = null) => {
  const events = new globalThis.EventTarget();
  const storage = new Map(
    saved ? [[APP_ROUTE_KEY, JSON.stringify(saved)]] : []
  );
  const env = {
    location: new URL(`https://example.test/meta-sovereign/?build=abc${hash}`),
    sessionStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    scrollX: 0,
    scrollY: 0,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    HashChangeEvent: globalThis.Event,
  };
  let index = 0;
  const entries = [{ url: env.location.href, state: null }];
  const write = (state, url, replace) => {
    const entry = { state, url: new URL(url, env.location).href };
    if (replace) {
      entries[index] = entry;
    } else {
      entries.splice(index + 1);
      entries.push(entry);
      index++;
    }
    env.location = new URL(entry.url);
  };
  env.history = {
    get state() {
      return entries[index].state;
    },
    get length() {
      return entries.length;
    },
    replaceState: (state, _title, url) => write(state, url, true),
    pushState: (state, _title, url) => write(state, url, false),
    go: (delta) => {
      index += delta;
      env.location = new URL(entries[index].url);
      events.dispatchEvent(new globalThis.Event('popstate'));
      events.dispatchEvent(new globalThis.Event('hashchange'));
    },
  };
  env.history.back = () => env.history.go(-1);
  return env;
};

test('every section has a reloadable route; deep links keep their owner', () => {
  for (const [view] of navItems) {
    const env = browser(`#/${view}`);
    const nav = createAppNavigation(env);
    nav.start()();
    assert.equal(nav.snapshot().view, view);
    assert.equal(createAppNavigation(env).snapshot().view, view);
  }
  assert.equal(parseAppRoute('#conn-telegram/manual').view, 'connections');
  assert.deepEqual(
    parseAppRoute(chatHash({ source: 'telegram', chat: '-100:1' })).chat,
    { source: 'telegram', chat: '-100:1' }
  );
  assert.deepEqual(parseAppRoute(operatorHash('telegram:42')).chat, {
    source: 'telegram',
    chat: '42',
  });
  assert.equal(parseAppRoute('#chat=telegram:%broken'), null);
  assert.equal(parseAppRoute('#/does-not-exist'), null);
});

test('section changes create one history entry; Back/Forward restores section and detail', () => {
  const env = browser();
  const nav = createAppNavigation(env);
  const stop = nav.start();
  nav.go({ view: 'operator', anchor: operatorHash('telegram:42') });
  const count = env.history.length;
  nav.go({ view: 'operator' });
  assert.equal(
    env.history.length,
    count,
    'reselecting a menu item is not a new visit'
  );
  nav.go({ view: 'connections', anchor: '#conn-email' });
  nav.go(
    { view: 'connections', anchor: '#conn-email/manual' },
    { replace: true }
  );
  assert.equal(
    env.history.length,
    count + 1,
    'switching provider modes replaces the entry'
  );
  nav.go({ view: 'settings' });
  env.history.go(-1);
  assert.equal(nav.snapshot().anchor, '#conn-email/manual');
  env.history.go(-1);
  assert.equal(nav.snapshot().anchor, operatorHash('telegram:42'));
  env.history.go(1);
  assert.equal(nav.snapshot().anchor, '#conn-email/manual');
  assert.equal(env.location.search, '?build=abc');
  stop();
});

test('native deep-link hash changes select the owning section; skip links retain it', () => {
  const env = browser('#/operator');
  const nav = createAppNavigation(env);
  const stop = nav.start();
  env.location.hash = '#chat=telegram:123';
  env.dispatchEvent(new globalThis.Event('hashchange'));
  assert.equal(nav.snapshot().view, 'chat');
  env.location.hash = '#root';
  env.dispatchEvent(new globalThis.Event('hashchange'));
  env.scrollY = 20;
  env.dispatchEvent(new globalThis.Event('scroll'));
  assert.equal(env.location.hash, '#root');
  assert.equal(nav.snapshot().view, 'chat');
  nav.go({ view: 'invalid' });
  assert.equal(nav.snapshot().view, 'chat');
  stop();
});

test('explicit URLs beat remembered sections, while empty URLs restore the last tab-local place', () => {
  const saved = {
    view: 'operator',
    hashes: { operator: operatorHash('telegram:42') },
  };
  assert.equal(
    createAppNavigation(browser('', saved)).snapshot().anchor,
    operatorHash('telegram:42')
  );
  assert.equal(
    createAppNavigation(browser('#/contacts', saved)).snapshot().view,
    'contacts'
  );
  const env = browser('#/settings');
  env.sessionStorage = {
    getItem: () => {
      throw Error('storage disabled');
    },
    setItem: () => {
      throw Error('storage disabled');
    },
  };
  const nav = createAppNavigation(env);
  nav.start()();
  nav.go({ view: 'operator' });
  assert.equal(nav.snapshot().view, 'operator');
});

test('provider Back consumes the parent entry, while a direct link replaces itself with the list', () => {
  const env = browser('#/connections');
  const nav = createAppNavigation(env);
  const stop = nav.start();
  nav.go({ view: 'connections', anchor: '#conn-telegram' });
  nav.back({ view: 'connections', anchor: '' });
  assert.equal(nav.snapshot().anchor, '#/connections');
  env.history.go(1);
  assert.equal(nav.snapshot().anchor, '#conn-telegram');
  stop();
  const direct = browser('#conn-telegram');
  const opened = createAppNavigation(direct);
  opened.start()();
  opened.back({ view: 'connections', anchor: '' });
  assert.equal(direct.history.length, 1);
  assert.equal(opened.snapshot().anchor, '#/connections');
});
