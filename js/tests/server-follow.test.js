import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPageLifetime, followServer } from '../src/web/server-follow.js';

const location = {
  origin: 'http://127.0.0.1:8787',
  href: 'http://127.0.0.1:8787/',
};
const client = { on: () => () => {} };
const useLocation = (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: location,
  });
  t.after(() => {
    if (previous) {
      Object.defineProperty(globalThis, 'location', previous);
    } else {
      delete globalThis.location;
    }
  });
};

test('discovery completing after navigation cannot start a reload timer', async (t) => {
  useLocation(t);
  const lifetime = new AbortController();
  const discovery = Promise.withResolvers();
  const finishing = discovery.promise.then((origin) =>
    followServer(client, origin, { signal: lifetime.signal })
  );
  lifetime.abort();
  discovery.resolve(null);
  const follow = await finishing;
  follow?.stop?.();
  assert.equal(follow, null);
});

test('navigation stops offline rediscovery before its next probe', async (t) => {
  useLocation(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ service: 'meta-sovereign' }),
  }));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const lifetime = new AbortController();
  const follow = followServer(client, null, { signal: lifetime.signal });
  lifetime.abort();
  t.mock.timers.tick(5000);
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
  follow?.stop?.();
  assert.equal(fetch.mock.callCount(), 0);
});

test('page lifetime ends on navigation and survives a bfcache suspension', () => {
  const events = new globalThis.EventTarget();
  const signal = createPageLifetime(events);
  const suspended = new globalThis.Event('pagehide');
  Object.defineProperty(suspended, 'persisted', { value: true });
  events.dispatchEvent(suspended);
  assert.equal(signal.aborted, false);
  events.dispatchEvent(new globalThis.Event('pagehide'));
  assert.equal(signal.aborted, true);
});

for (const navigated of [false, true]) {
  test(`a changed build reloads only a live document (navigated=${navigated})`, async (t) => {
    useLocation(t);
    const reload = t.mock.fn();
    location.reload = reload;
    t.after(() => delete location.reload);
    const response = Promise.withResolvers();
    let calls = 0;
    t.mock.method(globalThis, 'fetch', () => {
      calls += 1;
      return calls === 1
        ? Promise.resolve({ ok: true, headers: new Map([['etag', 'old']]) })
        : response.promise;
    });
    const lifetime = new AbortController();
    const follow = followServer(client, location.origin, {
      signal: lifetime.signal,
    });
    const checking = follow.check();
    for (let i = 0; i < 10 && calls < 2; i++) {
      await Promise.resolve();
    }
    assert.equal(calls, 2, 'the second build request is in flight');
    if (navigated) {
      lifetime.abort();
    }
    response.resolve({ ok: true, headers: new Map([['etag', 'new']]) });
    await checking;
    assert.equal(reload.mock.callCount(), navigated ? 0 : 1);
    follow.stop();
  });
}
