// A message that leaves the open chat goes like in Telegram's web app:
// it stays in its place, marked `leaving`, while its bubble shrinks and
// its place closes, so no space is left where it was (any network).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  LEAVE_MS,
  closePlace,
  keepLeaving,
  leaveMs,
} from '../src/web/chat-leaving.js';
import { MessageBubble } from '../src/web/chat-message.js';
import { LocaleContext, translate } from '../src/web/i18n.js';

const ids = (list) => list.map((id) => ({ id }));
const shape = (list) => list.map((m) => (m.leaving ? `-${m.id}` : m.id));

test('a deleted message stays in its place, leaving, until it is gone', () => {
  const before = ids(['a', 'b', 'c', 'd']);
  assert.deepEqual(shape(keepLeaving(before, ids(['a', 'c', 'd']))), [
    'a',
    '-b',
    'c',
    'd',
  ]);
  // The first, the last, several at once, and one that arrived meanwhile.
  assert.deepEqual(shape(keepLeaving(before, ids(['b', 'c']))), [
    '-a',
    'b',
    'c',
    '-d',
  ]);
  assert.deepEqual(shape(keepLeaving(before, ids(['a', 'd', 'e']))), [
    'a',
    '-b',
    '-c',
    'd',
    'e',
  ]);
  assert.deepEqual(shape(keepLeaving(before, [])), ['-a', '-b', '-c', '-d']);
  // Nothing left: the same list, untouched.
  const next = ids(['a', 'b', 'c', 'd', 'e']);
  assert.equal(keepLeaving(before, next), next);
});

test('a sent message that became its link is not one that left', () => {
  const queued = [{ id: 'msg:a' }, { id: 'pending:1', clientId: 'q1' }];
  const arrived = [{ id: 'msg:a' }, { id: 'msg:b', clientId: 'q1' }];
  assert.deepEqual(shape(keepLeaving(queued, arrived)), ['msg:a', 'msg:b']);
});

test('a message already leaving is kept as it is', () => {
  const leaving = { id: 'b', leaving: true };
  const out = keepLeaving([{ id: 'a' }, leaving], [{ id: 'a' }]);
  assert.equal(out[1], leaving);
});

test('the place closes over Telegram’s time, the gap after it too', () => {
  const calls = [];
  const node = {
    parentElement: {},
    getBoundingClientRect: () => ({ height: 48 }),
    animate: (frames, options) => {
      calls.push({ frames, options });
      return { cancel() {} };
    },
  };
  const saved = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ rowGap: '8px' });
  try {
    assert.ok(closePlace(node, LEAVE_MS));
  } finally {
    globalThis.getComputedStyle = saved;
  }
  const [{ frames, options }] = calls;
  assert.deepEqual(frames, [
    { height: '48px', marginBottom: '0px' },
    { height: '0px', marginBottom: '-8px' },
  ]);
  assert.equal(options.delay + options.duration, LEAVE_MS);
  assert.equal(options.fill, 'forwards');
  // Reduced motion, or no Web Animations: nothing is animated.
  assert.equal(closePlace(node, 0), null);
  assert.equal(closePlace({}, LEAVE_MS), null);
});

test('reduced motion lets a message go at once', () => {
  const saved = globalThis.matchMedia;
  try {
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(leaveMs(), 0);
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(leaveMs(), LEAVE_MS);
  } finally {
    globalThis.matchMedia = saved;
  }
});

test('a leaving bubble is marked for its animation and takes no input', () => {
  const draw = (message) =>
    renderToStaticMarkup(
      React.createElement(
        LocaleContext.Provider,
        { value: { locale: 'en', t: (k, v) => translate('en', k, v) } },
        React.createElement(MessageBubble, {
          message,
          showAvatar: true,
          onAction: () => {},
        })
      )
    );
  const base = {
    id: 'msg:vk:1:7',
    source: 'vk',
    chat: '1',
    sender: '1',
    body: 'hello',
    timestamp: '2026-10-20T10:00:00Z',
  };
  const shown = draw(base);
  assert.doesNotMatch(shown, /is-leaving/);
  assert.match(shown, /data-seen-id/);
  const leaving = draw({ ...base, leaving: true });
  assert.match(leaving, /class="bubble-row is-leaving"/);
  assert.match(leaving, /data-leaving="true"/);
  assert.match(leaving, /aria-hidden="true"/);
  assert.doesNotMatch(leaving, /data-seen-id/);
});
