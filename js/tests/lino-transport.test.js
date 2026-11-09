import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LINO_TYPES,
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  decodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

const value = {
  ok: true,
  nothing: null,
  items: [false, 0, 'true', '42', [], {}, ['a', 'b']],
  label: '你好\nПривет',
  empty: '',
  nested: { 'unsafe:key': 'quoted "value"' },
};

for (const type of LINO_TYPES) {
  test(`${type} preserves typed values, Unicode and empty containers`, () => {
    const encoded = encodeWire(value, type);
    assert.equal(typeof encoded, type === LINO_BINARY ? 'object' : 'string');
    assert.deepEqual(decodeWire(encoded, `${type}; charset=utf-8`), value);
  });
}

test('HTTP normalization preserves provider bigint IDs and dates', () => {
  const encoded = encodeWire({
    id: 123n,
    at: new Date('2026-11-09T00:00:00Z'),
    omitted: undefined,
    values: [undefined, NaN],
  });
  assert.deepEqual(decodeWire(encoded), {
    id: '123',
    at: '2026-11-09T00:00:00.000Z',
    values: [null, null],
  });
});

test('JSON compatibility requires explicit opt-in in both directions', () => {
  assert.throws(() => encodeWire(value, 'application/json'), /unsupported/);
  assert.throws(() => decodeWire('{}', 'application/json'), /unsupported/);
  const options = { jsonCompatibility: true };
  assert.deepEqual(
    decodeWire(
      encodeWire(value, 'application/json', options),
      'application/json',
      options
    ),
    value
  );
});

test('response reader accepts text and binary and refuses unexpected JSON', async () => {
  for (const type of [LINO_TEXT, LINO_BINARY]) {
    const response = new globalThis.Response(encodeWire(value, type), {
      headers: { 'content-type': type },
    });
    assert.deepEqual(await readWireResponse(response), value);
  }
  await assert.rejects(
    readWireResponse(globalThis.Response.json(value)),
    /unsupported/
  );
  assert.equal(
    await readWireResponse(new globalThis.Response(null, { status: 204 })),
    null
  );
});

test('malformed bytes and finite excessive nesting are rejected', () => {
  assert.throws(() => decodeWire(new Uint8Array([0xff]), LINO_TEXT));
  assert.throws(() => decodeWire(new Uint8Array([0xff]), LINO_BINARY));
  const nested = `${'('.repeat(80)}a${')'.repeat(80)}`;
  assert.throws(() => decodeWire(nested, LINO_TEXT));
});
