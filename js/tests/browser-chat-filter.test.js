import test from 'node:test';
import assert from 'node:assert/strict';
import {
  browserChatFilterState,
  withBrowserChatFilter,
} from '../src/sources/browser-chat-filter.js';
import { normalizeChatScanOptions } from '../src/sources/browser-scan-options.js';
import { HH_WEB_UI } from '../src/sources/hh-web-ui.js';
import { browserInactiveView } from '../src/sources/browser-inactive-view.js';
import { chatFilterFixture } from '../../experiments/issue-56/chat-filter-fixture.mjs';

const settings = { unreadOnly: true, waitMs: 10 };
const run = (fixture, read, options = {}, pause = async () => {}) =>
  withBrowserChatFilter(
    fixture,
    HH_WEB_UI,
    { ...settings, ...options },
    read,
    pause
  );
const control = (fixture, operation, extra = {}) =>
  fixture.evaluate({
    fn: browserChatFilterState,
    args: [
      {
        spec: HH_WEB_UI.chatScan.unreadFilter,
        item: HH_WEB_UI.chats.item,
        token: 'first',
        unreadOnly: true,
        operation,
        ...extra,
      },
    ],
  });

test('unread filter selection accepts only explicit booleans before browser admission', () => {
  for (const unreadOnly of [null, 0, 1, 'true', 'false', {}, []]) {
    assert.throws(() => normalizeChatScanOptions({ unreadOnly }), {
      code: 'bad-chat-scan',
    });
  }
  for (const unreadOnly of [undefined, false, true]) {
    assert.equal(normalizeChatScanOptions({ unreadOnly }).limit, 500);
  }
});

test('native filter selection verifies both directions and restores the original scroll', async () => {
  for (const original of [false, true]) {
    const fixture = chatFilterFixture({ original });
    const result = await run(
      fixture,
      async (verify) => {
        await verify();
        assert.equal(fixture.checkbox.checked, !original);
        fixture.root.scrollTop = 50;
        return { restored: true, rows: [{ chat: '7' }] };
      },
      { unreadOnly: !original }
    );
    assert.equal(result.filter.before, original);
    assert.equal(result.filter.observed, !original);
    assert.equal(result.filter.restored, true);
    assert.equal(result.filter.scrollRestored, true);
    assert.equal(result.restored, true);
    assert.equal(fixture.root.scrollTop, 300);
    assert.equal(fixture.checkbox.checked, original);
    assert.equal(fixture.clicks.length, 2);
    assert.equal(fixture.listeners(), 0);
  }
});

test('already selected and single-input filter layouts avoid extra activation', async () => {
  for (const fallback of [false, true]) {
    const fixture = chatFilterFixture({ original: true, fallback });
    const result = await run(fixture, async () => ({ restored: true }));
    assert.equal(fixture.clicks.length, 0);
    assert.equal(result.filter.restored, true);
    assert.equal(fixture.listeners(), 0);
  }
});

test('owner input and changed filter values yield without restoring over the owner', async () => {
  for (const change of [
    (fixture) => fixture.emit('wheel'),
    (fixture) => fixture.emit('input', { trusted: false }),
    (fixture) => {
      fixture.checkbox.checked = false;
    },
    (fixture) => fixture.replace(),
    (fixture) => {
      fixture.root.isConnected = false;
    },
  ]) {
    const fixture = chatFilterFixture();
    const result = await run(fixture, async (verify) => {
      change(fixture);
      await assert.rejects(verify());
      fixture.root.scrollTop = 77;
      return { restored: false };
    });
    assert.equal(result.restored, false);
    assert.equal(result.filter.restored, false);
    assert.equal(fixture.root.scrollTop, 77);
    assert.equal(fixture.clicks.length, 1);
    assert.equal(fixture.listeners(), 0);
  }
});

test('cancellation and reader errors restore only a still-owned filter and drain listeners', async () => {
  const fixture = chatFilterFixture();
  const controller = new AbortController();
  const failure = new Error('reader stopped');
  await assert.rejects(
    run(
      fixture,
      async () => {
        controller.abort();
        throw failure;
      },
      { signal: controller.signal }
    ),
    failure
  );
  assert.equal(fixture.checkbox.checked, false);
  assert.equal(fixture.root.scrollTop, 300);
  assert.equal(fixture.listeners(), 0);
  assert.equal(fixture.clicks.length, 2);
});

test('ambiguous and nonresponding controls cannot claim successful filter selection', async () => {
  for (const ambiguous of [false, true]) {
    const fixture = chatFilterFixture({ refuse: true });
    if (ambiguous) {
      fixture.ambiguous();
    }
    await assert.rejects(run(fixture, assert.fail), {
      code: ambiguous
        ? 'browser-chat-filter-unavailable'
        : 'browser-chat-filter-filter-changed',
    });
    assert.equal(fixture.listeners(), 0);
    assert.equal(fixture.root.scrollTop, ambiguous ? 300 : 0);
  }
});

test('another token cannot inspect or release an owned filter', () => {
  const fixture = chatFilterFixture();
  assert.equal(control(fixture, 'open').state, 'ready');
  assert.equal(fixture.listeners(), 7);
  for (const operation of ['open', 'status', 'release']) {
    assert.equal(control(fixture, operation, { token: 'other' }).state, 'busy');
  }
  assert.equal(fixture.listeners(), 7);
  control(fixture, 'release');
  assert.equal(fixture.listeners(), 0);
});

test('inactive ownership is checked before a native filter activation', () => {
  const fixture = chatFilterFixture();
  const key = Symbol.for('meta-sovereign.browser-inactive-view.v1');
  fixture.window[key] = { token: 'inactive', interrupted: false };
  assert.equal(
    control(fixture, 'open', { inactiveToken: 'inactive' }).state,
    'ready'
  );
  fixture.window[key].interrupted = true;
  assert.equal(control(fixture, 'set').state, 'owner-active');
  assert.equal(fixture.clicks.length, 0);
  control(fixture, 'release', { restore: true });
  assert.equal(fixture.listeners(), 0);
});

test('only the synchronous owned checkbox input preserves inactive ownership', async () => {
  for (const ownerInput of [false, true]) {
    const fixture = chatFilterFixture();
    const token = 'inactive';
    const inactive = (operation) =>
      fixture.evaluate({
        fn: browserInactiveView,
        args: [{ operation, token }],
      });
    assert.equal(inactive('open').state, 'ready');
    const result = await run(
      fixture,
      async (verify) => {
        assert.equal(inactive('status').state, 'ready');
        if (ownerInput) {
          fixture.emit('input');
          await assert.rejects(verify());
        } else {
          await verify();
        }
        return { restored: !ownerInput };
      },
      { inactiveToken: token }
    );
    assert.equal(result.filter.restored, !ownerInput);
    assert.equal(
      inactive('status').state,
      ownerInput ? 'owner-active' : 'ready'
    );
    inactive('release');
    assert.equal(fixture.listeners(), 0);
  }
});
