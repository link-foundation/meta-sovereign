import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeWireResponse } from '../src/server/wire.js';
import {
  formatLinoRecords,
  parseLinoRecords,
} from '../src/storage/lino-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createBackup, restoreBackup } from '../src/storage/backup.js';
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

test('wire and HTTP replies preserve large numbers and numeric-looking keys', () => {
  const value = {
    positive: 1e18,
    negative: -9007199254740992,
    1000000000000000000: '1000000000000000000',
    nested: [9007199254740992, [null], { count: 1000000000000000100 }],
  };
  for (const type of LINO_TYPES) {
    assert.deepEqual(decodeWire(encodeWire(value, type), type), value, type);
    const reply = encodeWireResponse({ lino: { type } }, 200, value);
    assert.deepEqual(decodeWire(reply.body, type), value, `HTTP ${type}`);
  }
  assert.deepEqual(parseLinoRecords(formatLinoRecords([value])), [value]);
});

test(
  'recovery archives preserve unsafe integer Number values',
  { timeout: 10_000 },
  async (t) => {
    const archiveDir = await mkdtemp(join(tmpdir(), 'ms-lino-numbers-'));
    t.after(() => rm(archiveDir, { recursive: true, force: true }));
    const value = {
      id: 'numeric:fixture',
      count: 1e18,
      nested: [-9007199254740992],
    };
    const source = createMemoryStore();
    await source.put(value);
    const file = await createBackup(source, { archiveDir });
    const restored = createMemoryStore();
    assert.equal(await restoreBackup(restored, file), 1);
    assert.deepEqual(await restored.get(value.id), value);
  }
);

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
