// Tests for the tutorial preference store + default step list (issue
// #10, R-M9..R-M12). These tests exercise the pure helpers so the
// React rendering layer (covered separately) does not need to boot.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultSteps,
  TUTORIAL_STORAGE_KEY,
  readPreference,
  writePreference,
  clearPreference,
} from '../src/web/tutorial.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

test('TUTORIAL_STORAGE_KEY is the documented metaSovereignTutorial key', () => {
  assert.equal(TUTORIAL_STORAGE_KEY, 'metaSovereignTutorial');
});

test('defaultSteps is a non-empty list of unique-id steps', () => {
  assert.ok(Array.isArray(defaultSteps));
  assert.ok(defaultSteps.length >= 3, 'expected at least three steps');
  const ids = defaultSteps.map((s) => s.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    'tutorial step ids must be unique'
  );
  for (const step of defaultSteps) {
    assert.equal(typeof step.id, 'string');
    assert.equal(typeof step.title, 'string');
    assert.equal(typeof step.body, 'string');
    assert.ok(step.title.length > 0);
    assert.ok(step.body.length > 0);
  }
});

test('readPreference returns null on a fresh storage', () => {
  const storage = fakeStorage();
  assert.equal(readPreference(storage), null);
});

test('writePreference + readPreference round-trips a dismissed tutorial', () => {
  const storage = fakeStorage();
  const value = { off: true, at: 1700000000000 };
  writePreference(storage, value);
  const read = readPreference(storage);
  assert.deepEqual(read, value);
  // Persisted shape on disk is JSON.
  assert.equal(storage.getItem(TUTORIAL_STORAGE_KEY), JSON.stringify(value));
});

test('clearPreference removes the entry so readPreference is null again', () => {
  const storage = fakeStorage();
  writePreference(storage, { off: true, at: 1 });
  assert.ok(readPreference(storage));
  clearPreference(storage);
  assert.equal(readPreference(storage), null);
});

test('readPreference returns null for malformed JSON', () => {
  const storage = fakeStorage();
  storage.setItem(TUTORIAL_STORAGE_KEY, 'not-json');
  assert.equal(readPreference(storage), null);
});

test('readPreference is null-safe when storage is undefined', () => {
  assert.equal(readPreference(undefined), null);
  assert.equal(readPreference(null), null);
});

test('writePreference and clearPreference tolerate a null storage', () => {
  // Should not throw — restricted-browser path.
  writePreference(null, { off: true, at: 0 });
  clearPreference(null);
  writePreference(undefined, { off: true, at: 0 });
  clearPreference(undefined);
});

test('writePreference tolerates a storage that throws on setItem', () => {
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: () => {},
  };
  // Must not throw.
  writePreference(broken, { off: true, at: 0 });
});

test('every default step targets a real nav surface or is a shell-level step', async () => {
  const { navItems } = await import('../src/web/nav-items.js');
  const validIds = new Set(navItems.map(([id]) => id));
  for (const step of defaultSteps) {
    if (step.target !== undefined) {
      assert.ok(
        validIds.has(step.target),
        `tutorial step "${step.id}" targets unknown nav surface "${step.target}"`
      );
    }
  }
});
