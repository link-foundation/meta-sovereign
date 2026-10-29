import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  createRawPacking,
  rawMediaTypeOf,
} from '../src/storage/raw-packing.js';
import { packetChunks } from '../src/storage/binary-packet-stream.js';
import { encodePacket, externalRef } from '../src/storage/binary-packet.js';
import {
  encodeNetwork,
  encodeLinksArchive,
  linksArchivePackets,
} from '../src/storage/doublets-archive.js';
import { createWorkBudget } from '../src/storage/work-budget.js';
import {
  createInterner,
  createLinoTextStore,
} from '../src/storage/lino-store.js';

const raw = () => ({
  media: { caption: 'A repeated provider payload. '.repeat(400) },
  entities: [{ offset: 0, length: 5 }],
  flag: false,
  nullable: null,
});

test('startup string deduplication stays bounded without changing records or cold payloads', () => {
  const intern = createInterner({ coldPayloads: true, maxStrings: 4 });
  const provider = raw();
  for (let i = 0; i < 20; i += 1) {
    const record = {
      id: `msg:fixture:${i}`,
      tokens: ['message', 'fixture', String(i)],
      body: `body ${i}`,
      timestamp: '2026-10-29T20:00:00Z',
      raw: provider,
      snapshot: { body: `previous ${i}` },
    };
    const copied = intern(record);
    assert.deepEqual(copied, record);
    assert.notEqual(copied, record);
    assert.equal(copied.raw, provider);
    assert.equal(copied.snapshot, record.snapshot);
    assert.ok(intern.cachedStrings() <= 4);
  }
});

test('packed file records survive compaction and restart without changing archived payloads', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-memory-'));
  try {
    const file = path.join(dir, 'data.lino');
    const first = await createLinoTextStore(file);
    const current = { id: 'msg:1', body: 'new', raw: raw() };
    const version = {
      id: 'message-version:1',
      snapshot: { ...current, body: 'old' },
    };
    await first.putMany([current, version]);
    await first.flush();
    const loaded = await createLinoTextStore(file);
    assert.equal(loaded.memoryStats().packedRecords, 2);
    const deferred = await loaded.query();
    assert.equal(
      typeof Object.getOwnPropertyDescriptor(deferred[0], 'raw').get,
      'function'
    );
    assert.deepEqual(deferred[0].raw, current.raw);
    await loaded.put(deferred[0]);
    deferred[0].body = 'caller mutation';
    assert.equal((await loaded.get(current.id)).body, current.body);
    assert.deepEqual(await loaded.query(), [current, version]);
    await loaded.compact();
    await loaded.flush();
    const again = await createLinoTextStore(file);
    assert.equal(again.memoryStats().packedRecords, 2);
    assert.deepEqual(await again.query(), [current, version]);
    await again.delete(current.id);
    assert.equal(again.memoryStats().packedRecords, 1);
    await again.flush();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('cold payloads round-trip, remain opaque to metadata scans, and release on replacement/delete', async () => {
  const packing = createRawPacking();
  const store = createMemoryStore({
    retain: packing.retain,
    release: packing.release,
  });
  const link = { id: 'msg:telegram:1:1', body: 'body', raw: raw() };
  await store.put(link);
  assert.deepEqual(await store.get(link.id), link);
  const first = packing.stats();
  assert.equal(first.packedRecords, 1);
  assert.ok(first.packedBytes < first.unpackedBytes / 2);
  assert.equal(
    first.allocatedBytes,
    first.packedBytes,
    'small payloads do not pin large zlib/buffer slabs'
  );
  assert.equal(first.decodedPayloadsCached, 0);
  for (let i = 0; i < 100; i += 1) {
    await store.put({ ...link, body: `edit ${i}` });
  }
  assert.deepEqual(
    packing.stats(),
    first,
    'rewrites retain only the current payload'
  );
  const ids = [];
  await store.scan(
    (item) => item.id.startsWith('msg:'),
    2,
    (batch) => ids.push(...batch),
    (item) => item.id
  );
  assert.deepEqual(ids, [link.id]);
  await store.put({ id: 'message-version:1', snapshot: link });
  assert.deepEqual((await store.get('message-version:1')).snapshot, link);
  await store.delete(link.id);
  await store.delete('message-version:1');
  assert.deepEqual(packing.stats(), {
    packedRecords: 0,
    packedBytes: 0,
    allocatedBytes: 0,
    unpackedBytes: 0,
    decodedPayloadsCached: 0,
  });
});

test('deferred read copies preserve payload assignment and nested mutation without changing the store', async () => {
  const packing = createRawPacking();
  const store = createMemoryStore({
    retain: packing.retain,
    release: packing.release,
    copy: packing.copy,
  });
  const original = {
    id: 'msg:mutable',
    raw: raw(),
    snapshot: { body: 'old'.repeat(1000) },
  };
  await store.put(original);
  const record = await store.get(original.id);
  record.raw.media.caption = 'changed locally';
  assert.equal(record.raw.media.caption, 'changed locally');
  assert.deepEqual((await store.get(original.id)).raw, original.raw);
  record.raw = { replacement: true };
  await store.put(record);
  assert.deepEqual((await store.get(original.id)).raw, { replacement: true });
  assert.deepEqual((await store.get(original.id)).snapshot, original.snapshot);
  record.body = 'after put';
  assert.equal((await store.get(original.id)).body, undefined);
});

test('startup adopts private packed records without a second metadata copy', () => {
  const packing = createRawPacking();
  const record = packing.pack({ id: 'msg:startup', raw: raw() });
  assert.equal(packing.retain(record), record);
  assert.equal(packing.stats().packedRecords, 1);
  packing.release(record);
  assert.equal(packing.stats().packedBytes, 0);
});

test('cold media metadata follows replacement and public payload mutation', () => {
  const packing = createRawPacking();
  const input = {
    id: 'msg:metadata',
    raw: {
      media: { className: 'MessageMediaPoll', text: 'large '.repeat(100) },
    },
  };
  const held = packing.retain(input);
  assert.equal(rawMediaTypeOf(held), 'MessageMediaPoll');
  const copy = packing.copy(held);
  copy.raw.media.className = 'MessageMediaPhoto';
  assert.equal(rawMediaTypeOf(copy), 'MessageMediaPhoto');
  assert.equal(rawMediaTypeOf(held), 'MessageMediaPoll');
  const replaced = packing.retain(copy);
  assert.equal(rawMediaTypeOf(replaced), 'MessageMediaPhoto');
  delete copy.raw;
  assert.equal(rawMediaTypeOf(copy), undefined);
  assert.equal(rawMediaTypeOf(null), undefined);
});

test('wide packed records preserve all metadata without decoding cold fields', () => {
  const packing = createRawPacking();
  const original = Object.fromEntries([
    ['id', 'msg:wide'],
    ...Array.from({ length: 40 }, (_, i) => [`metadata${i}`, `value${i}`]),
    ['constructor', 'metadata constructor'],
    ['toString', 'metadata toString'],
    ['__proto__', 'metadata prototype'],
    ['raw', raw()],
    ['snapshot', { body: 'previous version '.repeat(100) }],
  ]);
  const held = packing.retain(original);
  const copy = packing.copy(held);
  assert.equal(Object.getPrototypeOf(held), Object.prototype);
  assert.deepEqual(Object.keys(copy), Object.keys(original));
  for (const key of Object.keys(original).filter(
    (field) => !['raw', 'snapshot'].includes(field)
  )) {
    assert.equal(copy[key], original[key]);
  }
  for (const field of ['raw', 'snapshot']) {
    assert.equal(
      typeof Object.getOwnPropertyDescriptor(copy, field).get,
      'function'
    );
    assert.deepEqual(copy[field], original[field]);
  }
  assert.deepEqual(copy, original);
  assert.equal(packing.stats().decodedPayloadsCached, 0);
  packing.release(held);
  assert.equal(packing.stats().packedRecords, 0);
});

test('streamed binary packets match the existing format with bounded chunks', async () => {
  for (const width of [1, 2, 4, 8]) {
    const packet = {
      external: true,
      sections: [
        {
          width,
          links: [
            [1, externalRef(0)],
            [2, externalRef(1), 3],
          ],
        },
      ],
    };
    const chunks = [];
    for await (const chunk of packetChunks(packet, { chunkBytes: 32 })) {
      chunks.push(Buffer.from(chunk));
      assert.ok(chunk.length <= 32);
    }
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(encodePacket(packet)));
  }
  const network = encodeNetwork([
    { id: 'msg:1', body: 'Hello 你好 🌎 '.repeat(30), raw: raw() },
  ]);
  const chunks = [];
  for (const packet of linksArchivePackets(network)) {
    for await (const chunk of packetChunks(packet, { chunkBytes: 128 })) {
      chunks.push(Buffer.from(chunk));
      assert.ok(chunk.length <= 128);
    }
  }
  assert.deepEqual(
    Buffer.concat(chunks),
    Buffer.from(encodeLinksArchive(network))
  );
});

test('background work yields after its CPU slice without sleeping on every item', async () => {
  let now = 0;
  const slept = [];
  const yieldWork = createWorkBudget({
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
  });
  await yieldWork();
  now = 7;
  await yieldWork();
  assert.deepEqual(slept, []);
  now = 8;
  await yieldWork();
  assert.deepEqual(slept, [24]);
  now = 39;
  await yieldWork();
  assert.deepEqual(slept, [24]);
  now = 40;
  await yieldWork();
  assert.deepEqual(slept, [24, 24]);
});
