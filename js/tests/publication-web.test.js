import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicationApi } from '../src/web/publication-api.js';
import {
  newPublicationDraft,
  readPublicationDraft,
  savePublicationDraft,
  matchesPublicationPreview,
  hasUncertainPublication,
} from '../src/web/publication-state.js';
import { isReadRequest } from '../src/web/request-policy.js';

test('publication draft retains the exact pending body and request ID across reload', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const draft = {
    ...newPublicationDraft(),
    text: 'News',
    targetIds: ['broadcast-target:news'],
  };
  draft.pending = {
    text: draft.text,
    targetIds: draft.targetIds,
    requestId: draft.requestId,
  };
  assert.equal(savePublicationDraft(draft, storage), true);
  assert.deepEqual(readPublicationDraft(storage), draft);
  assert.equal(
    savePublicationDraft(draft, {
      setItem() {
        throw new Error('blocked');
      },
    }),
    false
  );
});

test('confirmation comparison binds destinations, modes and the exact message', () => {
  const plan = {
    requestId: 'one',
    text: 'News',
    targets: [{ id: 'news', version: 'v1' }],
    capabilities: [{ mode: 'bot' }],
  };
  assert.equal(matchesPublicationPreview(plan, { ...plan }), true);
  for (const altered of [
    { ...plan, text: 'Changed' },
    { ...plan, debug: true },
    { ...plan, targets: [{ id: 'news', version: 'v2' }] },
    { ...plan, capabilities: [{ mode: 'user' }] },
  ]) {
    assert.equal(matchesPublicationPreview(plan, altered), false);
  }
  assert.equal(
    hasUncertainPublication({
      status: 'partial',
      results: [{ status: 'unknown' }],
    }),
    true
  );
  assert.equal(
    hasUncertainPublication({ status: 'sent', results: [{ status: 'sent' }] }),
    false
  );
});

test('a denied localStorage getter preserves composing but refuses unsafe publication', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('Access denied');
    },
  });
  try {
    const draft = readPublicationDraft();
    assert.equal(draft.text, '');
    assert.ok(draft.requestId);
    assert.equal(savePublicationDraft(draft), false);
    assert.equal(savePublicationDraft(draft, {}), false);
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original);
    } else {
      delete globalThis.localStorage;
    }
  }
});

test('browser publication calls preserve input errors and distinguish unavailable from interrupted writes', async () => {
  const calls = [];
  let answer = null;
  const api = createPublicationApi({
    request: async (...args) => {
      calls.push(args);
      return answer;
    },
    confirmed: async (...args) => {
      calls.push(args);
      return answer;
    },
  });
  assert.equal((await api.publish({}, () => true)).status, 'unavailable');
  answer = { status: 'failed', code: 'network' };
  assert.equal((await api.publish({}, () => true)).status, 'unknown');
  answer = { httpStatus: 500, code: 'internal' };
  assert.equal((await api.delete({}, () => true)).status, 'unknown');
  answer = {
    httpStatus: 400,
    code: 'bad-target',
    error: 'Invalid destination',
  };
  assert.equal((await api.publish({}, () => true)).code, 'bad-target');
  answer = new globalThis.Response(
    JSON.stringify({ code: 'bad-target', error: 'Invalid destination' }),
    { status: 400 }
  );
  assert.equal((await api.saveTarget({})).error, 'Invalid destination');
  assert.equal(calls.at(-1)[1].method, 'PUT');
  assert.equal(isReadRequest('/api/broadcast/preview', 'POST'), true);
  assert.equal(isReadRequest('/api/broadcast/test', 'POST'), true);
  assert.equal(isReadRequest('/api/broadcast/publish', 'POST'), false);
  assert.equal(isReadRequest('/api/broadcast/delete', 'POST'), false);
});
