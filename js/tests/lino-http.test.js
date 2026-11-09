import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/index.js';
import { browserPolicyId } from '../src/browser/policy.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

const fixture = async (t, options = {}) => {
  const store = createMemoryStore();
  const handle = await startServer({
    store,
    port: 0,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    automations: { scheduler: false },
    ...options,
  });
  t.after(() => handle.close());
  return { store, origin: `http://127.0.0.1:${handle.port}` };
};

test('HTTP defaults to readable LINO and negotiates binary responses', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(`${origin}/sources`);
  assert.match(response.headers.get('content-type'), /^text\/lino\b/);
  assert.ok(Array.isArray(await readWireResponse(response)));
  const binary = await fetch(`${origin}/sources`, {
    headers: { accept: LINO_BINARY },
  });
  assert.equal(binary.status, 200);
  assert.match(
    binary.headers.get('content-type'),
    /^application\/lino-binary\b/
  );
  assert.ok(Array.isArray(await readWireResponse(binary)));
});

test('text and binary writes round-trip and preserve origin checks', async (t) => {
  const { origin } = await fixture(t);
  for (const [index, type] of [LINO_TEXT, LINO_BINARY].entries()) {
    const body = {
      scope: 'case',
      key: index ? 'cv' : 'messages',
      headless: true,
    };
    const send = (extra = {}) =>
      fetch(`${origin}/api/browser/policies`, {
        method: 'POST',
        headers: { accept: type, 'content-type': type, ...extra },
        body: encodeWire(body, type),
      });
    const response = await send();
    assert.equal(response.status, 200);
    assert.equal((await readWireResponse(response)).policy.headless, true);
    const denied = await send({ origin: 'https://untrusted.invalid' });
    assert.equal(denied.status, 403);
    assert.equal((await readWireResponse(denied)).ok, false);
  }
});

test('JSON, unacceptable responses and malformed bodies cannot mutate by default', async (t) => {
  const { store, origin } = await fixture(t);
  for (const headers of [
    { accept: 'application/json', 'content-type': LINO_TEXT },
    { accept: LINO_TEXT, 'content-type': 'application/json' },
  ]) {
    const response = await fetch(`${origin}/api/browser/policies`, {
      method: 'POST',
      headers,
      body:
        headers.accept === LINO_TEXT
          ? '{"scope":"default","headless":true}'
          : encodeWire({ scope: 'default', headless: true }),
    });
    assert.equal(response.status, headers.accept === LINO_TEXT ? 415 : 406);
  }
  assert.equal(await store.get(browserPolicyId('default')), null);
  const bad = await fetch(`${origin}/api/browser/policies`, {
    method: 'POST',
    headers: { 'content-type': LINO_BINARY },
    body: new Uint8Array([255]),
  });
  assert.equal(bad.status, 400);
  assert.equal((await readWireResponse(bad)).code, 'bad-lino');
});

test('explicit JSON compatibility preserves legacy clients', async (t) => {
  const { origin } = await fixture(t, { jsonCompatibility: true });
  const response = await fetch(`${origin}/api/browser/policies`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: '{"scope":"default","headless":true}',
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.equal((await response.json()).policy.headless, true);
  const preferred = await fetch(`${origin}/sources`, {
    headers: { accept: LINO_TEXT },
  });
  assert.match(preferred.headers.get('content-type'), /^text\/lino/);
});

test('specific Accept exclusions override wildcards', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(`${origin}/sources`, {
    headers: { accept: 'text/*;q=0, application/lino-binary;q=0, */*;q=1' },
  });
  assert.equal(response.status, 406);
});

test('default Lino requests retain object validation and streaming size limits', async (t) => {
  const { store, origin } = await fixture(t);
  for (const body of [encodeWire([1]), '(unclosed']) {
    const response = await fetch(`${origin}/api/browser/policies`, {
      method: 'POST',
      headers: { 'content-type': LINO_TEXT },
      body,
    });
    assert.equal(response.status, 400);
    assert.equal((await readWireResponse(response)).code, 'bad-lino');
  }
  // Finite 1 MiB probe of the route ceiling, never a decoder stress test.
  const large = await fetch(`${origin}/api/browser/policies`, {
    method: 'POST',
    headers: { 'content-type': LINO_TEXT },
    body: 'x'.repeat(1024 * 1024 + 1),
  });
  assert.equal(large.status, 413);
  assert.equal((await readWireResponse(large)).code, 'too-large');
  assert.equal(await store.get(browserPolicyId('default')), null);
});

test('model downloads and client diagnostics use Lino at their custom boundaries', async (t) => {
  const entries = [];
  const { origin } = await fixture(t, { log: (entry) => entries.push(entry) });
  for (const type of [LINO_TEXT, LINO_BINARY]) {
    const model = await fetch(`${origin}/api/suggest/model`, {
      headers: { accept: type, 'accept-encoding': 'gzip' },
    });
    assert.equal(model.status, 200);
    assert.equal(model.headers.get('content-encoding'), 'gzip');
    assert.ok(Array.isArray((await readWireResponse(model)).links));
    const report = await fetch(`${origin}/api/client-log`, {
      method: 'POST',
      headers: { 'content-type': type },
      body: encodeWire(
        { event: 'wire_fixture', count: 2, message: 'omit' },
        type
      ),
    });
    assert.equal(report.status, 204);
  }
  const reports = entries.filter(
    (entry) => entry.event === 'client_wire_fixture'
  );
  assert.equal(reports.length, 2);
  assert.ok(
    reports.every((entry) => entry.count === 2 && !('message' in entry))
  );
});
