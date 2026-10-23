// The page model of a private call (R-Y196): which link is the call, when it
// is shown, the words of its state, who may be called. The clock is fixed
// and passed to every function that takes it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FRESH_MS,
  LINK_ID,
  callLinkOf,
  canCall,
  elapsedSeconds,
  endedText,
  failureKey,
  isLive,
  ringsOut,
  shownCall,
  statusKey,
  timerText,
} from '../src/web/private-call-model.js';
import { enChatMore as en } from '../src/web/locales/en-chat-more.js';

const NOW = Date.parse('2026-03-01T12:00:00Z');
const link = (patch = {}) => ({
  id: LINK_ID,
  ref: 'r1',
  phase: 'waiting',
  out: true,
  connected: false,
  at: new Date(NOW).toISOString(),
  ...patch,
});

test('the call is the live link; none among other links', () => {
  const call = link();
  assert.equal(callLinkOf([{ id: 'x' }, call]), call);
  assert.equal(callLinkOf([{ id: 'x' }]), null);
  assert.equal(callLinkOf(null), null);
});

test('what is shown: live calls, fresh incoming and ended ones', () => {
  const options = { now: NOW };
  assert.ok(shownCall(link({ phase: 'incoming', out: false }), options));
  assert.ok(shownCall(link({ phase: 'active', connected: true }), options));
  // A call the user closed stays closed.
  assert.equal(
    shownCall(link({ phase: 'ended' }), {
      ...options,
      dismissed: new Set(['r1']),
    }),
    null
  );
  // An old ringing call is a leftover.
  const old = new Date(NOW - FRESH_MS - 1000).toISOString();
  assert.equal(shownCall(link({ phase: 'incoming', at: old }), options), null);
  assert.equal(shownCall(link({ phase: 'ended', at: old }), options), null);
  // An unanswered incoming call that ended just goes; an outgoing one says why.
  assert.equal(shownCall(link({ phase: 'ended', out: false }), options), null);
  assert.ok(
    shownCall(link({ phase: 'ended', out: true, reason: 'busy' }), options)
  );
  assert.ok(
    shownCall(link({ phase: 'ended', out: false, connected: true }), options)
  );
  assert.equal(shownCall(null, options), null);
});

test('state words: a key per phase, the reason when ended', () => {
  const keys = {
    incoming: 'chat.call.incoming',
    waiting: 'chat.call.waiting',
    ringing: 'chat.call.ringing',
    connecting: 'chat.call.connecting',
    active: 'chat.call.active',
  };
  for (const [phase, key] of Object.entries(keys)) {
    assert.equal(statusKey({ phase }), key);
  }
  assert.equal(
    statusKey({ phase: 'ended', reason: 'missed' }),
    'chat.call.end.missed'
  );
  assert.equal(statusKey({ phase: 'ended' }), 'chat.call.end.hangup');
  assert.equal(
    endedText({ phase: 'ended', reason: 'failed', code: 'privacy' }),
    'chat.call.err.privacy'
  );
  assert.equal(
    endedText({ phase: 'ended', reason: 'busy' }),
    'chat.call.end.busy'
  );
  assert.equal(failureKey('whatever'), 'chat.call.err.failed');
  assert.equal(failureKey('dh-hash'), 'chat.call.err.dh-hash');
});

test('every phase, reason and failure the page can show has its words', () => {
  const keys = [
    ...['incoming', 'waiting', 'ringing', 'connecting', 'active'].map((phase) =>
      statusKey({ phase })
    ),
    ...['hangup', 'missed', 'busy', 'disconnect', 'migrate', 'failed'].map(
      (reason) => statusKey({ phase: 'ended', reason })
    ),
    ...[
      'privacy',
      'blocked',
      'outdated',
      'busy',
      'gone',
      'flood',
      'no-access',
      'dh',
      'dh-hash',
      'dh-config',
      'fingerprint',
      'restart',
      'other',
    ].map(failureKey),
  ];
  for (const key of keys) {
    assert.equal(typeof en[key], 'string', key);
  }
});

test('the running time', () => {
  const call = { startedAt: NOW - 65_000 };
  assert.equal(elapsedSeconds(call, NOW), 65);
  assert.equal(elapsedSeconds({ startedAt: 0 }, NOW), 0);
  assert.equal(elapsedSeconds({ startedAt: NOW + 5000 }, NOW), 0);
  assert.equal(timerText(0), '0:00');
  assert.equal(timerText(65), '1:05');
  assert.equal(timerText(3723), '1:02:03');
});

test('which calls are live; which ring out', () => {
  assert.equal(isLive(null), false);
  assert.equal(isLive({ phase: 'ended' }), false);
  assert.equal(isLive({ phase: 'active' }), true);
  assert.equal(ringsOut({ out: true, phase: 'waiting' }), true);
  assert.equal(ringsOut({ out: true, phase: 'ringing' }), true);
  assert.equal(ringsOut({ out: true, phase: 'active' }), false);
  assert.equal(ringsOut({ out: false, phase: 'incoming' }), false);
  assert.equal(ringsOut(null), false);
});

test('who may be called: a person, not a bot, group or Saved Messages, and not mid-call', () => {
  const chat = { source: 'telegram', chat: '42', personal: true };
  const info = { kind: 'user', bot: false };
  assert.equal(canCall(chat, info, null), true);
  assert.equal(canCall(chat, { kind: 'user', bot: true }, null), false);
  assert.equal(canCall(chat, { kind: 'channel' }, null), false);
  assert.equal(canCall(chat, null, null), false);
  assert.equal(canCall({ ...chat, chat: '-100' }, info, null), false);
  assert.equal(canCall({ ...chat, personal: false }, info, null), false);
  assert.equal(canCall({ ...chat, source: 'whatsapp' }, info, null), false);
  assert.equal(canCall(chat, info, { phase: 'active' }), false);
  assert.equal(canCall(chat, info, { phase: 'ended' }), true);
});
