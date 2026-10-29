import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createUnreadNavigator } from '../src/web/chat-mark-navigation.js';
import { BubbleFooter } from '../src/web/chat-message-meta.js';
import { goToMessage } from '../src/web/chat-jump.js';

const navigatorFor = (extra = {}) => {
  const shown = [];
  const read = [];
  const errors = [];
  const api = {
    telegramUnreadMarks: async () => ({ ok: true, ids: [8], count: 1 }),
    telegramReadMarks: async (body) => {
      read.push(body);
      return { ok: true };
    },
  };
  const navigation = createUnreadNavigator({
    api,
    chat: '-7',
    scrollTo: async (id) => {
      shown.push(id);
      return true;
    },
    onError: (error) => {
      if (error) {
        errors.push(error);
      }
    },
    ...extra,
  });
  return { navigation, shown, read, errors, api };
};

test('a mention already loaded jumps immediately and acknowledges only that message', async () => {
  const fixture = navigatorFor({ localIds: () => [8], count: () => 1 });
  fixture.api.telegramUnreadMarks = async () => {
    throw new Error('unnecessary provider request');
  };
  assert.equal(await fixture.navigation.next('mentions'), true);
  assert.deepEqual(fixture.shown, ['msg:telegram:-7:8']);
  assert.deepEqual(fixture.read, [
    { chat: '-7', kind: 'mentions', ids: [8], last: false },
  ]);
});

test('an unsuccessful jump keeps the same mark for another attempt without acknowledging it', async () => {
  let visible = false;
  const targets = [];
  const fixture = navigatorFor({
    scrollTo: async (id) => {
      targets.push(id);
      return visible;
    },
  });
  assert.equal(await fixture.navigation.next('mentions'), false);
  assert.equal(fixture.read.length, 0);
  visible = true;
  assert.equal(await fixture.navigation.next('mentions'), true);
  assert.deepEqual(targets, ['msg:telegram:-7:8', 'msg:telegram:-7:8']);
  assert.equal(fixture.read.length, 1);
});

test('failed mark loads, stale clicks and partial pages cannot mark unseen messages as read', async () => {
  const fixture = navigatorFor();
  fixture.api.telegramUnreadMarks = async () => ({
    ok: false,
    code: 'telegram-reconnect',
  });
  assert.equal(await fixture.navigation.next('mentions'), false);
  assert.equal(fixture.read.length, 0);
  let finish;
  fixture.api.telegramUnreadMarks = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const first = fixture.navigation.next('mentions');
  assert.equal(
    first,
    fixture.navigation.next('mentions'),
    'rapid clicks share one navigation'
  );
  fixture.navigation.stop();
  finish({ ok: true, ids: [9], count: 1 });
  assert.equal(await first, false);
  assert.equal(fixture.read.length, 0);
  const partial = navigatorFor();
  partial.api.telegramUnreadMarks = async () => ({
    ok: true,
    ids: [8],
    count: 101,
  });
  assert.equal(await partial.navigation.next('mentions'), true);
  assert.equal(
    partial.read[0].last,
    false,
    'the end of a page is not the end of all unread marks'
  );
});

test('the timestamp placeholder never contains a second animated delivery icon', () => {
  for (const delivery of ['sending', 'waiting', 'sent', 'read', 'failed']) {
    const props = {
      parts: {},
      message: { delivery },
      time: () => '12:00',
      t: (key) => key,
    };
    const spacer = renderToStaticMarkup(
      React.createElement(BubbleFooter, { ...props, spacer: true })
    );
    const footer = renderToStaticMarkup(
      React.createElement(BubbleFooter, props)
    );
    assert.match(spacer, /bubble-status-spacer/);
    assert.doesNotMatch(spacer, /data-delivery|<svg/);
    assert.equal((footer.match(/data-delivery=/g) ?? []).length, 1);
  }
});

const jumpFixture = () => {
  const saved = {
    document: globalThis.document,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const timers = new Map();
  const classes = new Set();
  let next = 0;
  let visible = true;
  let present = true;
  let scrolls = 0;
  const node = {
    offsetWidth: 100,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    closest: () => ({
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0, bottom: 500 }),
    }),
    getBoundingClientRect: () =>
      visible ? { top: 100, bottom: 150 } : { top: 700, bottom: 750 },
    scrollIntoView: () => {
      scrolls++;
      visible = true;
    },
  };
  globalThis.document = { querySelector: () => (present ? node : null) };
  globalThis.setTimeout = (fn, ms) => {
    const id = ++next;
    if (ms === 1600) {
      timers.set(id, fn);
    } else {
      globalThis.queueMicrotask(fn);
    }
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  return {
    classes,
    timers,
    scrolls: () => scrolls,
    hide: () => {
      visible = false;
      present = false;
    },
    load: () => {
      present = true;
    },
    restore: () => Object.assign(globalThis, saved),
  };
};

test('message jumps highlight visible targets again and load/scroll to absent targets', async () => {
  const fixture = jumpFixture();
  try {
    assert.equal(await goToMessage('msg:telegram:-7:8'), true);
    assert.equal(
      fixture.scrolls(),
      0,
      'an already visible message does not move'
    );
    assert.ok(fixture.classes.has('is-found'));
    const first = [...fixture.timers.keys()][0];
    assert.equal(await goToMessage('msg:telegram:-7:8'), true);
    assert.equal(
      fixture.timers.has(first),
      false,
      'repeat clicks restart the highlight'
    );
    assert.equal(fixture.timers.size, 1);
    [...fixture.timers.values()][0]();
    assert.equal(fixture.classes.has('is-found'), false);
    fixture.hide();
    assert.equal(
      await goToMessage('msg:telegram:-7:9', async () => {
        fixture.load();
        return true;
      }),
      true
    );
    assert.equal(fixture.scrolls(), 1);
  } finally {
    fixture.restore();
  }
});
