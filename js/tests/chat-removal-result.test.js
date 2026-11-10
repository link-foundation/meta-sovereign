import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inactiveLeaveOutcome,
  removalError,
} from '../src/web/chat-removal-result.js';

test('inactive dialog consumes only explicit receipts and keeps partial or missing results visible', () => {
  const requested = ['-1001', '-1002'];
  assert.deepEqual(
    inactiveLeaveOutcome({ ok: true, left: requested }, requested),
    {
      left: requested,
      remaining: [],
      complete: true,
      blocked: [],
      unknown: false,
    }
  );
  for (const answer of [
    { ok: true, left: ['-1001'] },
    { ok: false, code: 'outcome-unknown', left: ['-1001'] },
  ]) {
    assert.deepEqual(inactiveLeaveOutcome(answer, requested), {
      left: ['-1001'],
      remaining: ['-1002'],
      complete: false,
      blocked: ['-1002'],
      unknown: true,
    });
  }
  for (const answer of [
    null,
    { left: ['-1001'] },
    { ok: true, code: 'outcome-unknown', left: ['-1001'] },
    {},
    { ok: true },
    { ok: true, left: ['-1009'] },
    { ok: true, left: ['-1001', '-1001'] },
  ]) {
    const result = inactiveLeaveOutcome(answer, requested);
    assert.deepEqual(result.left, []);
    assert.equal(result.complete, false);
    assert.deepEqual(result.blocked, requested);
  }
  assert.deepEqual(
    inactiveLeaveOutcome(
      { ok: false, code: 'not-admin', left: ['-1001'] },
      requested
    ).blocked,
    []
  );
});

test('removal messaging distinguishes confirmed membership with incomplete cleanup', () => {
  const t = (key) => key;
  assert.equal(
    removalError(t, {
      membership: 'confirmed',
      code: 'history-outcome-unknown',
    }),
    'chat.removal.historyPartial'
  );
  assert.equal(
    removalError(t, { code: 'outcome-unknown' }),
    'chat.removal.unknown'
  );
  assert.equal(removalError(t, { code: 'not-admin' }), 'chat.removal.failed');
});
