import test from 'node:test';
import assert from 'node:assert/strict';
import { operatorHash, parseAppRoute } from '../src/web/app-route.js';
import { syncOperatorRoute } from '../src/web/operator-route.js';

const card = (id) => ({ key: `telegram:${id}` });
const navigation = (hash) => {
  let route = parseAppRoute(hash);
  const writes = [];
  return {
    snapshot: () => route,
    go: (next, options) => {
      route = parseAppRoute(next.anchor);
      writes.push({ next, options });
    },
    // Browser history has already changed; the previous render's effect is late.
    restore: (key) => {
      route = parseAppRoute(operatorHash(key));
    },
    writes,
  };
};

test('late Operator card effects preserve newer Back and Forward destinations', () => {
  const first = card(111);
  const second = card(222);
  const queue = [first, second];
  const nav = navigation(operatorHash(first.key));
  nav.restore(second.key);
  syncOperatorRoute(first, queue, nav);
  assert.equal(nav.snapshot().chat.chat, '222');
  assert.equal(nav.writes.length, 0);
  syncOperatorRoute(second, queue, nav);
  nav.restore(first.key);
  syncOperatorRoute(second, queue, nav);
  assert.equal(nav.snapshot().chat.chat, '111');
  syncOperatorRoute(first, queue, nav);
  assert.equal(nav.snapshot().chat.chat, '111');
});

test('Operator fills an empty route and advances from finished or ineligible work', () => {
  const next = card(222);
  for (const hash of ['#/operator', operatorHash('telegram:111')]) {
    const nav = navigation(hash);
    syncOperatorRoute(next, [next], nav);
    assert.equal(nav.snapshot().chat.chat, '222');
    assert.equal(nav.writes[0].options.replace, true);
  }
  const nav = navigation('#/settings');
  syncOperatorRoute(next, [next], nav);
  syncOperatorRoute(null, [], nav);
  assert.equal(nav.snapshot().view, 'settings');
  assert.equal(nav.writes.length, 0);
});
