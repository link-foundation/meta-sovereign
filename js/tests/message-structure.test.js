import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildMessageLink } from '../src/sources/link.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createRawPacking } from '../src/storage/raw-packing.js';
import { createMemoryStore } from '../src/storage/universal.js';

const message = (overrides = {}) =>
  buildMessageLink({
    source: 'telegram',
    externalId: '111:7',
    sender: '222',
    chat: '111',
    body: 'Stored conversation',
    timestamp: '2026-10-30T12:00:00Z',
    replyTo: '111:3',
    raw: { message: 'Archived provider payload '.repeat(40) },
    ...overrides,
  });

test('standard message identifiers are derived without retaining arrays, with ordinary mutable public copies', async () => {
  const packing = createRawPacking();
  const store = createMemoryStore({
    retain: packing.retain,
    release: packing.release,
    copy: packing.copy,
  });
  const original = message();
  await store.put(original);
  const descriptors = await store.get(original.id, (record) =>
    Object.getOwnPropertyDescriptors(record)
  );
  assert.equal(typeof descriptors.children.get, 'function');
  assert.equal(typeof descriptors.tokens.get, 'function');
  assert(!Object.hasOwn(descriptors.children, 'value'));
  assert(!Object.hasOwn(descriptors.tokens, 'value'));
  assert(packing.stats().structuralUtf16BytesAvoided > 0);
  const copy = await store.get(original.id);
  assert.deepEqual(copy, original);
  copy.children.push('custom-child');
  copy.tokens[0] = 'custom-token';
  assert.deepEqual(await store.get(original.id), original);
  await store.put(copy);
  assert.deepEqual((await store.get(original.id)).children, copy.children);
  assert.deepEqual((await store.get(original.id)).tokens, copy.tokens);
  assert.equal(packing.stats().structuralUtf16BytesAvoided, undefined);
  await store.delete(original.id);
  assert.equal(packing.stats().packedRecords, 0);
});

test('nonstandard link arrays keep their exact stored values', async () => {
  const packing = createRawPacking();
  const original = {
    ...message(),
    children: ['not-derived'],
    tokens: ['custom'],
  };
  const retained = packing.retain(original);
  assert.deepEqual(retained, original);
  assert.equal(packing.stats().structuralUtf16BytesAvoided, undefined);
  const plain = { id: 'msg:email:7', source: 'email', body: 'plain' };
  assert.deepEqual(packing.retain(plain), plain);
});

test('derived identifiers survive edits, durable compaction and restart byte-for-byte', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'ms-message-structure-'));
  const opened = [];
  try {
    const file = path.join(folder, 'data.lino');
    const first = await createLinoTextStore(file);
    opened.push(first);
    const current = message();
    await first.put(current);
    await first.flush();
    const second = await createLinoTextStore(file);
    opened.push(second);
    assert.deepEqual(await second.get(current.id), current);
    const edit = message({ body: 'Updated', replyTo: '111:2' });
    await second.put(edit);
    await second.compact();
    await second.flush();
    const third = await createLinoTextStore(file);
    opened.push(third);
    assert.deepEqual(await third.get(edit.id), edit);
    assert(third.memoryStats().structuralUtf16BytesAvoided > 0);
  } finally {
    for (const store of opened) {
      await store.flush();
      await store.close();
    }
    await rm(folder, { recursive: true, force: true, maxRetries: 3 });
  }
});
