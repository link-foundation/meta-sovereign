import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLinoFetch } from '../src/transport/fetch.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  decodeWire,
} from '../src/transport/lino.js';
import { createRecoveringRequest } from '../src/web/request-recovery.js';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(`browser requests use ${type} for writes, replies and clones`, async () => {
    const value = { label: '你好', items: [false, '42', null] };
    const request = createLinoFetch(
      async (_url, init) => {
        assert.equal(init.headers.get('accept'), type);
        assert.equal(init.headers.get('content-type'), type);
        assert.deepEqual(decodeWire(init.body, type), value);
        return new globalThis.Response(encodeWire(value, type), {
          headers: { 'content-type': type },
        });
      },
      { type }
    );
    const response = await request('/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    assert.equal(response.ok, true);
    assert.deepEqual(await response.clone().json(), value);
    assert.deepEqual(await response.json(), value);
    await assert.rejects(response.json(), TypeError);
  });
}

test('raw upload and download bytes retain their representation', async () => {
  const bytes = new Uint8Array([0, 255, 128, 42]);
  const request = createLinoFetch(async (_url, init) => {
    assert.equal(init.body, bytes);
    assert.equal(init.headers.get('content-type'), 'application/octet-stream');
    return new globalThis.Response(bytes, {
      headers: { 'content-type': 'application/octet-stream' },
    });
  });
  const response = await request('/api/telegram/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: bytes,
  });
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('unexpected JSON is rejected unless the client explicitly enables compatibility', async () => {
  const fetchImpl = async () => globalThis.Response.json({ ok: true });
  await assert.rejects(
    (await createLinoFetch(fetchImpl)('/api/test')).json(),
    /unsupported/
  );
  const response = await createLinoFetch(fetchImpl, {
    jsonCompatibility: true,
  })('/api/test');
  assert.deepEqual(await response.json(), { ok: true });
});

test('streamed Lino replies retain progress, read recovery and mutation ownership', async () => {
  let calls = 0;
  const client = createRecoveringRequest({
    delays: [0],
    fetchImpl: createLinoFetch(async () => {
      calls += 1;
      return new globalThis.Response(
        encodeWire(calls < 3 ? { ok: false, code: 'network' } : { items: [1] }),
        {
          status: calls < 3 ? 503 : 200,
          headers: { 'content-type': LINO_TEXT },
        }
      );
    }),
  });
  try {
    const response = await client.request(
      '/api/test',
      {},
      { retry: true, json: true }
    );
    assert.deepEqual(await response.json(), { items: [1] });
    assert.equal(calls, 3);
  } finally {
    client.stop();
  }
  let mutations = 0;
  const mutation = createRecoveringRequest({
    fetchImpl: createLinoFetch(async () => {
      mutations += 1;
      throw new TypeError('connection lost');
    }),
  });
  try {
    await assert.rejects(
      mutation.request('/api/send', { method: 'POST' }),
      /connection lost/
    );
    assert.equal(mutations, 1);
  } finally {
    mutation.stop();
  }
});
