import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLocalStorage } from '../src/storage/local-storage.js';
import {
  pickBrowserDriver,
  pickSnapshotDriver,
} from '../src/storage/browser-store.js';

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

test('store selectors round-trip in memory when Web Storage is unavailable', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('storage is unavailable');
    },
  });
  try {
    for (const driver of [pickBrowserDriver(), pickSnapshotDriver('fixture')]) {
      assert.equal(await driver.load(), null);
      await driver.save({ links: [{ id: 'fixture' }] });
      assert.deepEqual(await driver.load(), { links: [{ id: 'fixture' }] });
    }
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', previous);
    } else {
      delete globalThis.localStorage;
    }
  }
});
