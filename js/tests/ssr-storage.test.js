import { test } from 'node:test';
import assert from 'node:assert/strict';

test('server appearance preferences do not evaluate the native storage getter', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let reads = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      reads += 1;
      return undefined;
    },
  });
  t.after(() => {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original);
    } else {
      delete globalThis.localStorage;
    }
  });
  const { readAppearance } = await import('../src/web/appearance.js');
  readAppearance();
  assert.equal(reads, 0, 'SSR must not initialize Node Web Storage');
});
