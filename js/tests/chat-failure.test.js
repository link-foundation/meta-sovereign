// R-Z4: a message that may have gone out is told as such in the composer,
// and the outbox never sends it again by itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { failureText } from '../src/web/chat-failure.js';
import { afterFailure } from '../src/web/chat-outbox.js';
import { translate } from '../src/web/i18n.js';

const t = (key) => key;

test('"send-unknown" has its own words in every language', () => {
  for (const code of ['send-unknown', 'unknown-delivery']) {
    assert.equal(failureText(t, { code }), 'chat.failure.sendUnknown');
  }
  const key = 'chat.failure.sendUnknown';
  const en = translate('en', key);
  assert.notEqual(en, key);
  for (const lang of ['ru', 'hi', 'zh']) {
    assert.notEqual(translate(lang, key), en, lang);
  }
});

test('a maybe-delivered message is not tried again by itself', () => {
  const item = { clientId: 'c1', key: 'vk:1', status: 'sending' };
  const next = afterFailure(item, { code: 'send-unknown' }, 0);
  assert.equal(next.status, 'failed');
  assert.equal(next.retryAt, null);
});
