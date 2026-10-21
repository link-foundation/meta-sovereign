// Issue #31 / PR #34: the associative storage stack — records as a
// deduplicated doublets network in the link-cli binary archive layout,
// and one Links Notation record per line in the text half.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findUsableClink } from '../src/storage/clink.js';
import {
  ArityRange,
  DecodeLimits,
  External,
  LinksPacket,
  PacketReader,
  Parser,
  Section,
} from 'links-notation';

import {
  decodePacket,
  encodePacket,
  externalRef,
  externalValue,
} from '../src/storage/binary-packet.js';
import {
  decodeArchive,
  encodeArchive,
  encodeNetwork,
  readNetwork,
} from '../src/storage/doublets-archive.js';
import {
  createDoubletsStore,
  createDualStore,
  createLinoTextStore,
  formatLinoRecords,
  parseLinoRecords,
} from '../src/storage/index.js';

const tmpdir = () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-assoc-'));

const records = () => [
  {
    id: 'msg:vk:1',
    tokens: ['msg', 'vk', '1'],
    children: [],
    source: 'vk',
    sender: '42',
    chat: '42',
    body: 'Привет 😀\n"кавычки" (скобки) \'апостроф\'',
    timestamp: '2026-01-01T00:00:00.000Z',
    replyTo: null,
  },
  {
    id: 'automation:reengage',
    tokens: ['automation', 'reengage'],
    enabled: true,
    paused: false,
    empty: '',
    reserved: 'ms:null',
    numbers: [0, -1.5, 1e21, 42],
    nested: { a: [{ b: [] }, {}], 'ms:key': 'x', 7: 'seven' },
  },
];

// The exact archive link-cli 4.0.0 writes for `(father: father father)
// (mother: mother mother) (child: mother father)`.
const CLINK_FIXTURE = Buffer.from(
  '12012003010102020201130270026001ff9a9f8c989b8efe93918c989b8efd9d9897949c',
  'hex'
);

test('records round-trip through the doublets archive exactly', () => {
  const input = records();
  assert.deepEqual(decodeArchive(encodeArchive(input)), input);
  assert.deepEqual(decodeArchive(encodeArchive([])), []);
});

test('equal values are stored once (associative deduplication)', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    id: `msg:vk:${i}`,
    source: 'vk',
    chat: '42',
    body: 'одинаковый текст',
  }));
  const { links, names } = encodeNetwork(many);
  assert.equal([...names.keys()].filter((n) => n === 'vk').length, 1);
  // Shared tails mean far fewer links than fields.
  assert.ok(links.length < 50 * 4 * 2, `${links.length} links`);
});

test('numeric-looking and reserved strings never become bare names', () => {
  const { names } = encodeNetwork(records());
  for (const name of names.keys()) {
    assert.ok(!/^\d+$/.test(name), `bare numeric name ${name}`);
    assert.notEqual(name, '');
  }
});

test('fast packets match links-notation LinksPacket byte for byte', () => {
  const links = [
    [1, 1],
    [2, 2],
    [2, 1],
    [300, 70000],
  ];
  const ours = encodePacket({ sections: [{ width: 4, links }] });
  const theirs = new LinksPacket(false, [
    new Section(0n, new ArityRange(2, 2), 4, links),
  ]).toBytes(DecodeLimits.unlimited());
  assert.deepEqual(ours, theirs);

  const rows = [
    [1, 102, 97],
    [2, 0x1f600, 109, 111, 109],
  ];
  const named = encodePacket({
    external: true,
    sections: [{ width: 4, links: rows.map((r) => r.map(externalRef)) }],
  });
  const reference = new LinksPacket(true, [
    new Section(
      0n,
      new ArityRange(3, 5),
      4,
      rows.map((r) => r.map((v) => new External(v)))
    ),
  ]).toBytes(DecodeLimits.unlimited());
  assert.deepEqual(named, reference);
  const back = new PacketReader(named).read(DecodeLimits.unlimited());
  assert.deepEqual(
    back.links().map(([, refs]) => refs.map((r) => Number(r.value))),
    rows
  );
  assert.deepEqual(
    decodePacket(named).links.map(([, refs]) => refs.map(externalValue)),
    rows
  );
});

test('fast reader decodes packets written by links-notation (any layout)', () => {
  const input = [
    [1, [1, 1]],
    [2, [2, 2]],
    [5, [1, 2, 3]],
  ];
  const bytes = LinksPacket.pack(false, input, true).toBytes(
    DecodeLimits.unlimited()
  );
  assert.deepEqual(decodePacket(bytes).links, input);
});

test('reads the archive link-cli writes (links packet + names packet)', () => {
  const { links, names } = readNetwork(new Uint8Array(CLINK_FIXTURE));
  assert.deepEqual(
    [...links],
    [
      [1, [1, 1]],
      [2, [2, 2]],
      [3, [2, 1]],
    ]
  );
  assert.deepEqual(
    [...names],
    [
      [1, 'father'],
      [2, 'mother'],
      [3, 'child'],
    ]
  );
});

// An installed link-cli that can import and export binary archives.
const clinkBinary = () => findUsableClink();

test(
  'link-cli imports and re-exports the archive unchanged',
  {
    skip: clinkBinary()
      ? false
      : 'no link-cli with binary archives is installed',
  },
  async () => {
    const dir = await tmpdir();
    const input = path.join(dir, 'data.bin');
    const output = path.join(dir, 'again.bin');
    await fs.writeFile(input, encodeArchive(records()));
    execFileSync(clinkBinary(), [
      '--db',
      path.join(dir, 'x.links'),
      '--import-binary',
      input,
      '--export-binary',
      output,
    ]);
    assert.deepEqual(decodeArchive(await fs.readFile(output)), records());
  }
);

test('text records are one Links Notation line each, parseable upstream', () => {
  const text = formatLinoRecords(records());
  assert.equal(text.trim().split('\n').length, 2);
  assert.equal(new Parser().parse(text).length, 2);
  assert.deepEqual(parseLinoRecords(text), records());
});

test('legacy indented .lino and MSDB1 files are still read', async () => {
  assert.deepEqual(parseLinoRecords('a x y\n  child b\n'), [
    { id: 'a', tokens: ['x', 'y'], children: ['b'] },
  ]);
  const dir = await tmpdir();
  const file = path.join(dir, 'data.bin');
  const json = Buffer.from(JSON.stringify([{ id: 'old', tokens: ['t'] }]));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(json.length, 0);
  await fs.writeFile(file, Buffer.concat([Buffer.from('MSDB1\n'), len, json]));
  const store = await createDoubletsStore(file);
  assert.deepEqual(await store.get('old'), { id: 'old', tokens: ['t'] });
  await store.put({ id: 'new', tokens: [] });
  await store.flush(); // the snapshot is written on an interval
  const migrated = decodeArchive(await fs.readFile(file));
  assert.deepEqual(
    migrated.map((l) => l.id),
    ['old', 'new']
  );
});

test('dual store keeps every field in both halves across reopen', async () => {
  const dir = await tmpdir();
  const text = await createLinoTextStore(path.join(dir, 'data.lino'));
  const binary = await createDoubletsStore(path.join(dir, 'data.bin'));
  const dual = createDualStore({ binary, text });
  await dual.putMany(records());
  assert.deepEqual(await dual.verify(), []);
  await dual.flush();
  const reopened = createDualStore({
    text: await createLinoTextStore(path.join(dir, 'data.lino')),
    binary: await createDoubletsStore(path.join(dir, 'data.bin')),
  });
  assert.deepEqual(await reopened.query(), records());
  assert.deepEqual(await reopened.verify(), []);
});

test('concurrent puts share coalesced writes and all persist', async () => {
  const dir = await tmpdir();
  const file = path.join(dir, 'data.bin');
  const store = await createDoubletsStore(file);
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => store.put({ id: `k${i}`, n: i }))
  );
  await store.flush();
  const again = await createDoubletsStore(file);
  assert.equal((await again.query()).length, 20);
});
