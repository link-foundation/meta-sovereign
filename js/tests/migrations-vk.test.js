// Migration 0003 (R-Z8, R-Z17): VK numeric reactions become emoji and image
// documents stored as files get their kind. Fakes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as m0003 from '../src/storage/migrations/0003-vk-reactions-docs.js';
import { runMigrations } from '../src/storage/migrations/core.js';
import { createMemoryStore } from '../src/storage/universal.js';

const vk = (n, extra = {}) => ({
  id: `msg:vk:${n}`,
  tokens: ['message', 'vk', String(n)],
  source: 'vk',
  chat: '7',
  sender: '7',
  body: `m${n}`,
  timestamp: 1700000000 + n,
  ...extra,
});

const oldStore = async () => {
  const store = createMemoryStore();
  await store.putMany([
    vk(1, {
      reactions: [
        { emoji: '3', count: 2 },
        { emoji: '99', count: 1, mine: true },
      ],
    }),
    vk(2, {
      attachments: [
        { kind: 'file', url: 'https://x/a.gif', name: 'a.gif', size: 5 },
        { kind: 'file', url: 'https://x/b.pdf', name: 'b.pdf', size: 9 },
      ],
      raw: {
        attachments: [
          {
            type: 'doc',
            doc: {
              type: 3,
              url: 'https://x/a.gif',
              title: 'a.gif',
              ext: 'gif',
            },
          },
          {
            type: 'doc',
            doc: {
              type: 1,
              url: 'https://x/b.pdf',
              title: 'b.pdf',
              ext: 'pdf',
            },
          },
        ],
      },
    }),
    vk(3, { reactions: [{ emoji: '👍', reactionId: 4, count: 1 }] }),
    { id: 'msg:telegram:1', source: 'telegram', reactions: [{ emoji: '3' }] },
  ]);
  return store;
};

const run = (store, options = {}) =>
  runMigrations(store, { migrations: [m0003], from: 2, ...options });

test('0003 draws reactions as emoji and gives image docs their kind', async () => {
  const store = await oldStore();
  const result = await run(store);
  assert.equal(result.to, 3);
  const one = await store.get('msg:vk:1');
  assert.deepEqual(one.reactions[0], { emoji: '😂', reactionId: 3, count: 2 });
  assert.equal(one.reactions[1].emoji, '99');
  assert.equal(one.reactions[1].reactionId, 99);
  assert.equal(one.reactions[1].mine, true);
  const two = await store.get('msg:vk:2');
  assert.equal(two.attachments[0].kind, 'gif');
  assert.equal(two.attachments[0].ext, 'gif');
  assert.equal(two.attachments[1].kind, 'file');
  assert.equal(two.id, 'msg:vk:2');
  assert.equal(two.timestamp, 1700000002);
  assert.deepEqual((await store.get('msg:telegram:1')).reactions, [
    { emoji: '3' },
  ]);
});

test('0003 is idempotent: the second run changes nothing', async () => {
  const store = await oldStore();
  await run(store);
  const second = await run(store);
  assert.equal(second.steps[0].changed, 0);
});

test('0003 dry run counts and writes nothing', async () => {
  const store = await oldStore();
  const before = JSON.stringify(await store.query(() => true));
  const result = await run(store, { dryRun: true });
  assert.equal(result.steps[0].changed, 2);
  assert.equal(JSON.stringify(await store.query(() => true)), before);
});
