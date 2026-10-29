import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLocalStorage } from '../src/storage/local-storage.js';

test('server rendering never evaluates a lazy Web Storage getter', () => {
  const env = {};
  Object.defineProperty(env, 'localStorage', {
    get() {
      throw new Error('Node lazy storage getter must not run');
    },
  });
  assert.equal(getLocalStorage(env), null);
});

test('browser storage and injected server storage remain available', () => {
  const storage = { getItem: () => 'saved' };
  assert.equal(getLocalStorage({ localStorage: storage }), storage);
  const browser = { window: {} };
  Object.defineProperty(browser, 'localStorage', { get: () => storage });
  assert.equal(getLocalStorage(browser), storage);
  assert.equal(getLocalStorage({}), null);
});

test('denied browser storage falls back without throwing', () => {
  const browser = { window: {} };
  Object.defineProperty(browser, 'localStorage', {
    get() {
      throw new Error('SecurityError: sandboxed origin');
    },
  });
  assert.equal(getLocalStorage(browser), null);
});
