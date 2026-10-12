// The provider page and its tab live in the URL hash, so reloads,
// links and Back land on the same page and tab.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  connectionHash,
  parseConnectionHash,
} from '../src/web/connections/hash.js';

test('#conn-<id> is the import tab, #conn-<id>/manual the manual one', () => {
  assert.deepEqual(parseConnectionHash('#conn-email'), {
    provider: 'email',
    mode: 'import',
  });
  assert.deepEqual(parseConnectionHash('#conn-telegram/manual'), {
    provider: 'telegram',
    mode: 'manual',
  });
  assert.deepEqual(parseConnectionHash('#conn-x/unknown'), {
    provider: 'x',
    mode: 'import',
  });
  for (const hash of ['', '#', '#chat', '#conn-']) {
    assert.equal(parseConnectionHash(hash).provider, null);
  }
  assert.deepEqual(parseConnectionHash(), parseConnectionHash(''));
  assert.equal(connectionHash('email'), '#conn-email');
  assert.equal(connectionHash('email', 'manual'), '#conn-email/manual');
  assert.equal(connectionHash('email', 'import'), '#conn-email');
});
