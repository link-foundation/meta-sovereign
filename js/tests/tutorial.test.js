// Tests for the tutorial preference store + default step list (issue
// #10, R-M9..R-M12). These tests exercise the pure helpers so the
// React rendering layer (covered separately) does not need to boot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  defaultSteps,
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_PROVIDER_KEY,
  TUTORIAL_VERSION,
  TutorialOverlay,
  readPreference,
  readProgressIndex,
  writePreference,
  writeProgressPreference,
  writeCompletedPreference,
  clearPreference,
} from '../src/web/tutorial.js';
import {
  anyConnection,
  shouldAutoOpen,
  startIndex,
} from '../src/web/tutorial-start.js';

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

test('the connect-setup step advances once a service connects', () => {
  const setup = defaultSteps.find((s) => s.id === 'setup');
  assert.ok(setup, 'expected a "setup" step');
  assert.equal(
    setup.completeOnConnect,
    true,
    'the setup step must advance when a connection finishes'
  );
});

test('the tour shows Contacts, then opens a chat from there', () => {
  const ids = defaultSteps.map((s) => s.id);
  assert.ok(ids.indexOf('contacts') < ids.indexOf('contacts-open'));
  assert.ok(ids.indexOf('contacts-open') < ids.indexOf('chat'));
  const open = defaultSteps.find((s) => s.id === 'contacts-open');
  assert.equal(open.tutorialId, 'contacts:open-chat');
  assert.deepEqual(open.route, { view: 'contacts' });
  assert.deepEqual(open.completeAt, { view: 'chat' });
  // No contacts yet (nothing synced): the step is skipped, not stuck.
  assert.equal(open.optional, true);
  assert.equal(open.action, true);
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
  // The current tutorial version is stamped on write.
  assert.deepEqual(read, { ...value, v: TUTORIAL_VERSION });
  assert.equal(
    storage.getItem(TUTORIAL_STORAGE_KEY),
    JSON.stringify({ ...value, v: TUTORIAL_VERSION })
  );
});

test('progress saved by an older tutorial version is force-reset', () => {
  const storage = fakeStorage();
  // An old build left the user mid-step with no version, or a different
  // one — this is exactly what made a Telegram selection resume onto
  // Email after the tour changed.
  storage.setItem(
    TUTORIAL_STORAGE_KEY,
    JSON.stringify({ stepId: 'setup', at: 1 })
  );
  // readPreference forgets the stale progress and clears it from storage,
  // so the tour re-opens from the start on the new version.
  assert.equal(readPreference(storage), null);
  assert.equal(storage.getItem(TUTORIAL_STORAGE_KEY), null);
  assert.equal(readProgressIndex(storage, defaultSteps), 0);
});

test('a tour turned off or finished stays off across versions (R-M11)', () => {
  for (const saved of [
    { off: true, stepId: 'setup', at: 1 },
    { off: true, completed: true, at: 2, v: TUTORIAL_VERSION - 1 },
  ]) {
    const storage = fakeStorage();
    storage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(saved));
    const pref = readPreference(storage);
    assert.equal(pref.off, true);
    assert.equal(pref.stepId, undefined);
    assert.equal(Boolean(pref.completed), Boolean(saved.completed));
    // Saved again under the current version.
    assert.equal(readPreference(storage).v, TUTORIAL_VERSION);
  }
});

test('the tour opens by itself only for a new user or a tour in progress', () => {
  assert.equal(shouldAutoOpen(null, false), true);
  assert.equal(shouldAutoOpen(null, true), false);
  assert.equal(shouldAutoOpen(null, null), false);
  assert.equal(shouldAutoOpen({ stepId: 'chat' }, true), true);
  assert.equal(shouldAutoOpen({ off: true }, false), false);
  assert.equal(shouldAutoOpen({ off: true, completed: true }, false), false);
});

test('with a service connected the tour starts after the connection steps', () => {
  const contacts = defaultSteps.findIndex((s) => s.id === 'contacts');
  assert.deepEqual(
    defaultSteps.filter((s) => s.connecting).map((s) => s.id),
    ['connect', 'pick', 'setup']
  );
  assert.equal(startIndex(defaultSteps, 0, true), contacts);
  assert.equal(startIndex(defaultSteps, 2, true), contacts);
  assert.equal(startIndex(defaultSteps, 0, false), 0);
  assert.equal(startIndex(defaultSteps, 0, null), 0);
  assert.equal(startIndex(defaultSteps, contacts + 1, true), contacts + 1);
});

test('a connection is the Telegram account or a saved credential', async () => {
  const api = (connected, links) => ({
    telegramStatus: async () => ({ connected }),
    links: async () => links,
  });
  assert.equal(await anyConnection(api(true, [])), true);
  assert.equal(
    await anyConnection(api(false, [{ id: 'secret:github:token' }])),
    true
  );
  assert.equal(await anyConnection(api(false, [{ id: 'msg:1' }])), false);
  assert.equal(
    await anyConnection({
      telegramStatus: async () => {
        throw new Error('offline');
      },
      links: async () => {
        throw new Error('offline');
      },
    }),
    false
  );
});

test('a version reset also forgets the remembered service', () => {
  const storage = fakeStorage();
  storage.setItem(
    TUTORIAL_STORAGE_KEY,
    JSON.stringify({ stepId: 'setup', at: 1, v: TUTORIAL_VERSION - 1 })
  );
  storage.setItem(TUTORIAL_PROVIDER_KEY, 'email');
  assert.equal(readPreference(storage), null);
  assert.equal(storage.getItem(TUTORIAL_PROVIDER_KEY), null);
});

test('progress saved by the current version is kept', () => {
  const storage = fakeStorage();
  writeProgressPreference(storage, defaultSteps[1]);
  const pref = readPreference(storage);
  assert.equal(pref.stepId, defaultSteps[1].id);
  assert.equal(pref.v, TUTORIAL_VERSION);
});

test('writeProgressPreference stores the current tutorial step id', () => {
  const storage = fakeStorage();
  writeProgressPreference(storage, defaultSteps[2]);
  const pref = readPreference(storage);

  assert.equal(pref.stepId, defaultSteps[2].id);
  assert.equal(typeof pref.at, 'number');
  assert.equal(readProgressIndex(storage, defaultSteps), 2);
});

test('writeCompletedPreference persists completed tutorials as off', () => {
  const storage = fakeStorage();
  writeCompletedPreference(storage);
  const pref = readPreference(storage);

  assert.equal(pref.off, true);
  assert.equal(pref.completed, true);
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

test('TutorialOverlay resumes from stored step progress after page reload', () => {
  const storage = fakeStorage();
  storage.setItem(
    TUTORIAL_STORAGE_KEY,
    JSON.stringify({
      stepId: 'automation',
      at: 1700000000000,
      v: TUTORIAL_VERSION,
    })
  );
  const html = renderToStaticMarkup(
    React.createElement(TutorialOverlay, {
      open: true,
      steps: defaultSteps,
      storage,
    })
  );

  assert.match(html, /data-tutorial-step="automation"/);
  // Position in the sequence is derived from defaultSteps so the
  // assertion stays in sync when the list grows (issue #25 prepended a
  // "connect" step).
  const total = defaultSteps.length;
  const idx = defaultSteps.findIndex((step) => step.id === 'automation') + 1;
  assert.match(html, new RegExp(`Step ${idx} of ${total}`));
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
