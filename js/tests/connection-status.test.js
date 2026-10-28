import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeOf } from '../src/web/telegram-online.js';

test('the header distinguishes initial offline, reconnecting, recovered and browser-offline states', () => {
  assert.deepEqual(badgeOf(false, {}), { online: false, reason: null });
  assert.equal(badgeOf(false, {}, { hadServer: true }).reconnecting, true);
  assert.equal(badgeOf(true, {}, { reconnecting: true }).reconnecting, true);
  assert.deepEqual(badgeOf(true, {}, { reconnecting: false }), {
    online: true,
    reason: null,
  });
  assert.deepEqual(
    badgeOf(true, {}, { reconnecting: true, browserOnline: false }),
    { online: false, reason: null }
  );
  assert.equal(
    badgeOf(true, { reconnecting: true }).reason,
    'chat.banner.telegram'
  );
  assert.equal(
    badgeOf(true, { needsLogin: true, reconnecting: true }).reason,
    'header.telegramSignIn'
  );
  assert.deepEqual(badgeOf(true, { offline: true, reconnecting: true }), {
    online: false,
    reason: 'header.telegramOffline',
  });
});
