import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPayloadFile } from '../src/storage/payload-file.js';
import { createRawPacking } from '../src/storage/raw-packing.js';

test('cold file reads pending/flushed bytes exactly, reuses released slots and empties', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-payload-fixture-'));
  const file = createPayloadFile(dir);
  try {
    const data = Array.from({ length: 40 }, (_, n) =>
      Buffer.alloc(3000 + n, n)
    );
    const refs = data.map((bytes) => file.write(bytes));
    refs.forEach((ref) => file.retain(ref));
    for (const [i, ref] of refs.entries()) {
      assert.deepEqual(file.read(ref), data[i]);
    }
    assert.equal(file.stats().residentBytes, 65536);
    const size = file.stats().bytes;
    for (const i of [0, 15, 39]) {
      file.release(refs[i]);
      refs[i] = file.write(Buffer.alloc(data[i].length, 255));
      file.retain(refs[i]);
      assert.deepEqual(file.read(refs[i]), Buffer.alloc(data[i].length, 255));
    }
    assert.equal(
      file.stats().bytes,
      size,
      'updates reuse both disk and buffered holes'
    );
    refs.forEach((ref) => file.release(ref));
    assert.equal(file.stats().bytes, 0);
    assert.equal(file.stats().entries, 0);
    const next = file.write(Buffer.from('after truncate'));
    assert.equal(file.read(next).toString(), 'after truncate');
  } finally {
    file.close();
    file.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('public payload copies survive slot reuse and cache close without retaining the cache', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-payload-copy-'));
  const file = createPayloadFile(dir);
  const packing = createRawPacking({ payloadFile: file });
  try {
    const raw = {
      media: { className: 'MessageMediaPhoto' },
      text: 'photo'.repeat(300),
    };
    const held = packing.retain({ id: 'fixture', raw });
    const copy = packing.copy(held);
    assert.equal(packing.stats().allocatedBytes, 0);
    packing.release(held);
    const other = packing.retain({
      id: 'other',
      raw: { text: 'new'.repeat(400) },
    });
    packing.release(other);
    file.close();
    assert.deepEqual(copy.raw, raw);
    copy.raw.text = 'mutable';
    assert.equal(copy.raw.text, 'mutable');
  } finally {
    file.close();
    await rm(dir, { recursive: true, force: true });
  }
});
