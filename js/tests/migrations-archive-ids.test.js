// Migration 0005 (R-Z10, R-Z17): Facebook and LinkedIn archive messages
// get collision-free ids; old ids stay resolvable; a re-import of the same
// archive adds no duplicates. Fakes only; invented data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as m0005 from '../src/storage/migrations/0005-archive-ids.js';
import { runMigrations } from '../src/storage/migrations/core.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { shortHash } from '../src/sources/archive/text.js';
import { importDownloadedFile } from '../src/sources/auto-import/index.js';

const MOJIBAKE = 'Ð\u0098Ð²Ð°Ð½'; // "Иван" read as latin-1

const fb = (ms, extra = {}) => ({
  id: `msg:facebook:${ms}`,
  tokens: ['message', 'facebook', String(ms)],
  children: [
    'sender:facebook:Ann',
    'chat:facebook:inbox/ann_AbC',
    `body:facebook:${ms}`,
    `ts:facebook:${ms}`,
  ],
  source: 'facebook',
  sender: 'Ann',
  chat: 'inbox/ann_AbC',
  body: 'hi',
  timestamp: ms,
  ...extra,
});

const li = (conversation, date, extra = {}) => {
  const key = `${conversation}-${date}`;
  return {
    id: `msg:linkedin:${key}`,
    tokens: ['message', 'linkedin', key],
    children: [
      'sender:linkedin:Alice',
      `chat:linkedin:${conversation}`,
      `body:linkedin:${key}`,
      `ts:linkedin:${key}`,
    ],
    source: 'linkedin',
    sender: 'Alice',
    chat: conversation,
    body: 'hello',
    timestamp: date,
    raw: { id: conversation, date },
    ...extra,
  };
};

const oldStore = async () => {
  const store = createMemoryStore();
  await store.putMany([
    fb(1700000000000),
    fb(1700000000001, { sender: MOJIBAKE, body: MOJIBAKE }),
    fb(undefined, {
      id: 'msg:facebook:Ann-1700000000',
      chat: 'inbox/x',
      timestamp: undefined,
    }),
    { id: 'msg:facebook:mid.live1', source: 'facebook', body: 'live' },
    li('c1', '2026-01-01 10:00:00 UTC'),
    li('c2', 'not a date'),
    { id: 'msg:telegram:1', source: 'telegram' },
  ]);
  return store;
};

const run = (store, options = {}) =>
  runMigrations(store, { migrations: [m0005], from: 4, ...options });

const fbKey = (ms, sender = 'Ann') =>
  `msg:facebook:ann_AbC:${ms}:${shortHash(sender)}:0`;

test('0005 moves archive ids, keeps old ids resolvable, fixes times and text', async () => {
  const store = await oldStore();
  const result = await run(store);
  assert.equal(result.to, 5);

  const first = await store.get(fbKey(1700000000000));
  assert.equal(first.chat, 'ann_AbC');
  assert.equal(first.timestamp, '2023-11-14T22:13:20.000Z');
  assert.ok(first.children.includes('chat:facebook:ann_AbC'));
  assert.ok(first.children.some((c) => c.startsWith('ts:facebook:ann_AbC:')));
  assert.equal(await store.get('msg:facebook:1700000000000'), null);
  const alias = await store.get('alias:msg:facebook:1700000000000');
  assert.equal(alias.to, first.id);

  const repaired = await store.get(fbKey(1700000000001, 'Иван'));
  assert.equal(repaired.sender, 'Иван');
  assert.equal(repaired.body, 'Иван');

  const key = `msg:linkedin:c1:2026-01-01T10:00:00.000Z:${shortHash('Alice')}:0`;
  assert.equal((await store.get(key)).timestamp, '2026-01-01T10:00:00.000Z');
  assert.equal(
    (await store.get('alias:msg:linkedin:c1-2026-01-01 10:00:00 UTC')).to,
    key
  );

  // Not computable: left as they are.
  assert.ok(await store.get('msg:facebook:Ann-1700000000'));
  assert.ok(await store.get('msg:linkedin:c2-not a date'));
  assert.ok(await store.get('msg:facebook:mid.live1'));
  assert.ok(await store.get('msg:telegram:1'));
});

test('0005 is idempotent and its dry run counts without writing', async () => {
  const store = await oldStore();
  const dry = await run(store, { dryRun: true });
  assert.ok(dry.steps[0].changed > 0);
  assert.ok(await store.get('msg:facebook:1700000000000'), 'dry run wrote');
  await run(store);
  const links = async () =>
    JSON.stringify((await store.query()).filter((l) => l.id !== 'meta:schema'));
  const before = await links();
  const again = await run(store);
  assert.equal(again.steps?.[0]?.changed ?? 0, 0);
  assert.equal(await links(), before);
});

const THREAD = JSON.stringify({
  participants: [{ name: 'Ann' }, { name: 'Me' }],
  title: 'Ann',
  thread_path: 'inbox/ann_AbC',
  messages: [
    { sender_name: 'Ann', timestamp_ms: 1700000000000, content: 'hi' },
    { sender_name: 'Ann', timestamp_ms: 1700000000000, content: 'hi again' },
  ],
});

test('re-importing an archive imported under the old ids adds no duplicates', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-legacy-'));
  const file = path.join(dir, 'message_1.json');
  await fs.writeFile(file, THREAD);
  const folder = path.join(dir, 'inbox', 'ann_AbC');
  await fs.mkdir(folder, { recursive: true });
  await fs.copyFile(file, path.join(folder, 'message_1.json'));
  const archive = path.join(folder, 'message_1.json');
  for (const migrate of [false, true]) {
    const store = createMemoryStore();
    // What the old importer left: one link for the colliding pair.
    await store.putMany([fb(1700000000000, { chat: 'inbox/ann_AbC' })]);
    if (migrate) {
      await run(store);
    }
    await importDownloadedFile({
      store,
      provider: 'facebook',
      filePath: archive,
    });
    const messages = (await store.query()).filter((l) =>
      l.id.startsWith('msg:facebook:')
    );
    // The old link stands for the first row; the colliding second row is new.
    assert.equal(messages.length, 2, `migrate=${migrate}`);
    assert.equal(
      messages.filter((l) => l.body === 'hi').length,
      1,
      'the first message is not duplicated'
    );
    await importDownloadedFile({
      store,
      provider: 'facebook',
      filePath: archive,
    });
    const after = (await store.query()).filter((l) =>
      l.id.startsWith('msg:facebook:')
    );
    assert.equal(after.length, 2, 'a second re-import adds nothing');
  }
});
