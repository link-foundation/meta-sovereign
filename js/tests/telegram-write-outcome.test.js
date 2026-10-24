// Honest outcomes for account writes (R-Y218): an answer from Telegram keeps
// its code; no answer at all is `send-unknown`, never "failed", and nothing of
// the error's text is passed on.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  UNKNOWN_WRITE,
  writeFailureOf,
} from '../src/sources/telegram-write-outcome.js';
import { createSecurityExtras } from '../src/sources/telegram-security-extras.js';
import {
  fakeClient,
  helpers,
  named,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const fail = writeFailureOf({ CODE_INVALID: 'code-invalid' });

test('an RPC error keeps its code', () => {
  assert.deepEqual(fail(telegramError('CODE_INVALID')), {
    ok: false,
    error: 'CODE_INVALID',
    code: 'code-invalid',
  });
  assert.equal(fail(telegramError('SOMETHING_ELSE')).code, 'failed');
  assert.equal(fail(new Error('CODE_INVALID')).code, 'code-invalid');
});

test('no answer is unknown, marked ambiguous and not retryable', () => {
  const error = new Error('timeout, code 12345');
  const answer = fail(error);
  assert.deepEqual(answer, { ...UNKNOWN_WRITE });
  assert.equal(answer.outcome, 'unknown');
  assert.equal(answer.fallback, false);
  assert.ok(!JSON.stringify(answer).includes('12345'));
  assert.equal(error.ambiguous, true);
  assert.equal(error.safeToRetry, false);
  assert.equal(fail('plain string').code, 'send-unknown');
});

test('security writes that got no answer are unknown; reads and answers are not', async () => {
  const Api = {
    account: {
      ResetPassword: named('ResetPassword'),
      GetPasskeys: named('GetPasskeys'),
      DeletePasskey: named('DeletePasskey'),
    },
  };
  const make = (answer) =>
    createSecurityExtras(
      { importer: async () => ({ Api, helpers }) },
      { userClient: async () => fakeClient(answer, []) }
    );
  const lost = make(() => new Error('Connection closed 12345'));
  const reset = await lost.passwordReset();
  assert.equal(reset.code, 'send-unknown');
  assert.equal(reset.outcome, 'unknown');
  assert.equal((await lost.passkeyDelete({ id: 'k1' })).code, 'send-unknown');
  assert.equal((await lost.passkeys()).code, 'failed');
  assert.ok(!JSON.stringify([reset]).includes('12345'));
  const refused = make(() => telegramError('PASSKEY_ID_INVALID'));
  assert.equal(
    (await refused.passkeyDelete({ id: 'k1' })).code,
    'passkey-invalid'
  );
});
