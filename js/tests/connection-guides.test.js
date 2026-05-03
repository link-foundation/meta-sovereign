// Tests for the connection-guides registry and the tryDirect/CORS
// classifier (issue #10, R-M1..R-M8). Covers:
//   - every nav surface in views.js has a matching guide
//   - guides only cite providers that exist in providerCatalogue
//   - every catalogued provider is referenced by at least one guide
//   - tryDirect classifies success, http-error, cors-failure, network
//     and missing-fetch paths

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { navItems } from '../src/web/views.js';
import {
  connectionGuides,
  providerCatalogue,
  isCrossOrigin,
  tryDirect,
  localServerHelp,
  listGuideSections,
  getGuide,
  getProvider,
} from '../src/web/connection-guides.js';

test('every nav surface has a matching connection guide', () => {
  for (const [id] of navItems) {
    assert.ok(
      connectionGuides[id],
      `missing connection guide for nav surface "${id}"`
    );
    const guide = connectionGuides[id];
    assert.equal(typeof guide.title, 'string');
    assert.ok(guide.title.length > 0, `empty title for "${id}"`);
    assert.equal(typeof guide.body, 'string');
    assert.ok(guide.body.length > 0, `empty body for "${id}"`);
    assert.ok(Array.isArray(guide.providers));
  }
});

test('guides only cite providers that exist in providerCatalogue', () => {
  for (const [section, guide] of Object.entries(connectionGuides)) {
    for (const provider of guide.providers) {
      assert.ok(
        providerCatalogue[provider],
        `guide "${section}" cites unknown provider "${provider}"`
      );
    }
  }
});

test('every provider in the catalogue is referenced by at least one guide', () => {
  const referenced = new Set();
  for (const guide of Object.values(connectionGuides)) {
    for (const provider of guide.providers) {
      referenced.add(provider);
    }
  }
  for (const id of Object.keys(providerCatalogue)) {
    assert.ok(
      referenced.has(id),
      `provider "${id}" is in the catalogue but no guide references it`
    );
  }
});

test('every provider entry has archive + apiCredentials with required fields', () => {
  for (const [id, provider] of Object.entries(providerCatalogue)) {
    assert.equal(typeof provider.label, 'string', `${id}: missing label`);
    assert.ok(provider.archive, `${id}: missing archive section`);
    assert.equal(
      typeof provider.archive.title,
      'string',
      `${id}: missing archive.title`
    );
    assert.equal(
      typeof provider.archive.hint,
      'string',
      `${id}: missing archive.hint`
    );
    assert.ok(provider.apiCredentials, `${id}: missing apiCredentials section`);
    assert.equal(
      typeof provider.apiCredentials.envVar,
      'string',
      `${id}: missing apiCredentials.envVar`
    );
    assert.equal(
      typeof provider.apiCredentials.hint,
      'string',
      `${id}: missing apiCredentials.hint`
    );
    assert.equal(
      typeof provider.apiCredentials.probeUrl,
      'string',
      `${id}: missing apiCredentials.probeUrl`
    );
  }
});

test('localServerHelp covers Rust, Node, and a manual override hint', () => {
  assert.equal(typeof localServerHelp.title, 'string');
  assert.equal(typeof localServerHelp.body, 'string');
  assert.ok(Array.isArray(localServerHelp.options));
  const ids = localServerHelp.options.map((option) => option.id);
  assert.ok(ids.includes('rust'), 'expected a "rust" option');
  assert.ok(ids.includes('js-node'), 'expected a "js-node" option');
  assert.equal(localServerHelp.manualOverride.storageKey, 'metaServer');
});

test('isCrossOrigin compares URL.origin', () => {
  assert.equal(
    isCrossOrigin('https://api.example.com/x', 'http://localhost:9000'),
    true
  );
  assert.equal(
    isCrossOrigin('http://localhost:9000/api/status', 'http://localhost:9000'),
    false
  );
  assert.equal(
    isCrossOrigin('not-a-url', 'http://localhost'),
    false,
    'malformed URL should not crash'
  );
});

test('tryDirect resolves ok=true when fetch succeeds', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200 });
  const out = await tryDirect({
    url: 'https://api.example.com/v1/me',
    fetchImpl,
    origin: 'http://localhost:9000',
  });
  assert.deepEqual(out, { ok: true, status: 200 });
});

test('tryDirect classifies http error responses', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401 });
  const out = await tryDirect({
    url: 'https://api.example.com/v1/me',
    fetchImpl,
    origin: 'http://localhost:9000',
  });
  assert.equal(out.ok, false);
  assert.equal(out.classification, 'http');
  assert.equal(out.status, 401);
});

test('tryDirect classifies cross-origin TypeError as cors', async () => {
  const fetchImpl = async () => {
    throw new TypeError('Failed to fetch');
  };
  const out = await tryDirect({
    url: 'https://api.example.com/v1/me',
    fetchImpl,
    origin: 'http://localhost:9000',
  });
  assert.equal(out.ok, false);
  assert.equal(out.classification, 'cors');
  assert.ok(out.error instanceof Error);
});

test('tryDirect classifies same-origin failures as plain network errors', async () => {
  const fetchImpl = async () => {
    throw new Error('connection refused');
  };
  const out = await tryDirect({
    url: 'http://localhost:9000/api/status',
    fetchImpl,
    origin: 'http://localhost:9000',
  });
  assert.equal(out.ok, false);
  assert.equal(out.classification, 'network');
});

test('tryDirect requires a url', async () => {
  await assert.rejects(() => tryDirect({}), /url is required/);
});

test('tryDirect returns a network error when no fetch is available', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = undefined;
  try {
    const out = await tryDirect({
      url: 'https://api.example.com/v1/me',
      origin: 'http://localhost:9000',
    });
    assert.equal(out.ok, false);
    assert.equal(out.classification, 'network');
  } finally {
    globalThis.fetch = original;
  }
});

test('listGuideSections returns the same keys as connectionGuides', () => {
  assert.deepEqual(
    listGuideSections().sort(),
    Object.keys(connectionGuides).sort()
  );
});

test('getGuide throws on an unknown nav surface', () => {
  assert.throws(() => getGuide('not-a-real-surface'), /unknown nav surface/);
});

test('getProvider throws on an unknown provider id', () => {
  assert.throws(() => getProvider('not-a-real-provider'), /unknown provider/);
});
