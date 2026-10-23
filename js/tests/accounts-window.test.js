// The account switcher's pure page helpers (R-Y198).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accountLabel,
  unreadBadge,
  withUnread,
} from '../src/web/chat-accounts.js';

const t = (key, vars = {}) =>
  `${key}${vars.n === undefined ? '' : `:${vars.n}`}`;

test('unread badges: nothing for 0 or unknown, 99+ above 99', () => {
  assert.equal(unreadBadge(0), '');
  assert.equal(unreadBadge(null), '');
  assert.equal(unreadBadge(undefined), '');
  assert.equal(unreadBadge(7), '7');
  assert.equal(unreadBadge(100), '99+');
});

test('an account is called by name, then @username, then its slot', () => {
  assert.equal(accountLabel(t, { account: 2, name: 'Ann' }), 'Ann');
  assert.equal(accountLabel(t, { account: 2, username: 'ann' }), '@ann');
  assert.equal(accountLabel(t, { account: 3 }), 'chat.accounts.slot:3');
});

test('unread counts are joined by account', () => {
  const merged = withUnread(
    [{ account: 1 }, { account: 2 }, { account: 3 }],
    [{ account: 2, unread: 4 }]
  );
  assert.deepEqual(
    merged.map((a) => a.unread),
    [null, 4, null]
  );
  assert.equal(withUnread([{ account: 1 }], undefined)[0].unread, null);
});
