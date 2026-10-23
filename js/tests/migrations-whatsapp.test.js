// Migration 0002 (R-Z9, R-Z17): WhatsApp chats stored under typed numbers or
// titles move to the stable ids R-Z9 writes. Fakes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as m0002 from '../src/storage/migrations/0002-whatsapp-chat-ids.js';
import { runMigrations } from '../src/storage/migrations/core.js';
import { archiveChatId } from '../src/sources/whatsapp-ids.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { runModuleScript } from './helpers/run-module-script.js';

const NUMBER = '+49 170 123 4567';
const web = (chat, key, extra = {}) => ({
  id: `msg:whatsapp:${chat}:${key}`,
  tokens: ['message', 'whatsapp', chat],
  source: 'whatsapp',
  chat,
  sender: 'Anna',
  body: `hello ${key}`,
  timestamp: '2026-10-12T07:32:00.000Z',
  outgoing: false,
  via: 'browser',
  children: [`chat:whatsapp:${chat}`],
  ...extra,
});
const archived = (n, chat, extra = {}) => ({
  id: `msg:whatsapp:${n}`,
  tokens: ['message', 'whatsapp', String(n)],
  children: [`sender:whatsapp:Bob`, `chat:whatsapp:${chat}`],
  source: 'whatsapp',
  body: `line ${n}`,
  timestamp: '2026-04-30, 14:32:11',
  sender: 'Bob',
  chat,
  replyTo: null,
  ...extra,
});

const oldStore = async () => {
  const store = createMemoryStore();
  await store.putMany([
    web(NUMBER, 'A1'),
    web(NUMBER, 'A2'),
    web('491701234567@c.us', '491701234567@c.us'),
    web('Anna', 'T1'),
    web('123-456@g.us', 'G1'),
    archived(1, 'Team Q4'),
    archived(2, 'unknown'),
    archived(3, 'unknown', { chatName: 'Mia' }),
    {
      id: `chat:whatsapp:${NUMBER}`,
      tokens: ['chat', 'whatsapp', NUMBER],
      children: [],
    },
    {
      id: 'msg:telegram:1',
      tokens: ['message', 'telegram', '1'],
      source: 'telegram',
      chat: '491701234567',
      children: ['chat:telegram:491701234567'],
    },
  ]);
  return store;
};

const run = (store, options = {}) =>
  runMigrations(store, { migrations: [m0002], from: 1, ...options });

test('0002 moves typed numbers, JIDs and named exports to stable chat ids', async () => {
  const store = await oldStore();
  const result = await run(store);
  assert.equal(result.to, 2);
  const a1 = await store.get(`msg:whatsapp:+491701234567:A1`);
  assert.equal(a1.chat, '+491701234567');
  assert.deepEqual(a1.tokens, ['message', 'whatsapp', '+491701234567']);
  assert.deepEqual(a1.children, ['chat:whatsapp:+491701234567']);
  assert.equal(await store.get(`msg:whatsapp:${NUMBER}:A1`), null);
  // The old id still resolves through its alias.
  assert.equal(
    (await store.get(`alias:msg:whatsapp:${NUMBER}:A1`)).to,
    'msg:whatsapp:+491701234567:A1'
  );
  assert.ok(await store.get('chat:whatsapp:+491701234567'));
  // A participant key is not a message id: the id stays, the chat moves.
  const part = await store.get(
    'msg:whatsapp:491701234567@c.us:491701234567@c.us'
  );
  assert.equal(part.chat, '+491701234567');
  // Exports: counter ids stay, chat becomes the name hash.
  const one = await store.get('msg:whatsapp:1');
  assert.equal(one.chat, archiveChatId('Team Q4'));
  assert.deepEqual(one.children, [
    'sender:whatsapp:Bob',
    `chat:whatsapp:${archiveChatId('Team Q4')}`,
  ]);
  assert.equal((await store.get('msg:whatsapp:3')).chat, archiveChatId('Mia'));
  // Nothing to compute from: left as it was.
  assert.equal((await store.get('msg:whatsapp:Anna:T1')).chat, 'Anna');
  assert.equal((await store.get('msg:whatsapp:2')).chat, 'unknown');
  assert.equal(
    (await store.get('msg:whatsapp:123-456@g.us:G1')).chat,
    '123-456@g.us'
  );
  // Other networks are never touched.
  assert.equal((await store.get('msg:telegram:1')).chat, '491701234567');
});

test('0002 is idempotent: the second run changes nothing', async () => {
  const store = await oldStore();
  await run(store);
  const second = await run(store, { from: 1 });
  assert.equal(second.steps[0].changed, 0);
});

test('0002 dry run counts and writes nothing', async () => {
  const store = await oldStore();
  const before = JSON.stringify(await store.query(() => true));
  const result = await run(store, { dryRun: true });
  assert.ok(result.steps[0].changed > 0);
  assert.equal(JSON.stringify(await store.query(() => true)), before);
});

const SOURCES = new URL('../src/sources/index.js', import.meta.url).href;
// The child reports its own zone offset: Deno on Windows ignores TZ, so the
// fixed instants are asserted only where the zone took effect (R-Z6).
const parseIn = (zone) =>
  JSON.parse(
    runModuleScript(
      `const { getSource } = await import(${JSON.stringify(SOURCES)});
       const links = await getSource('whatsapp').parseArchive('12/10/2026, 14:32 - Anna: hi\\n1/3/2026, 23:30 - Anna: late');
       console.log(JSON.stringify({
         stamps: links.map((l) => l.timestamp),
         local: new Date(2026, 9, 12, 14, 32, 0).toISOString(),
         offset: new Date(2026, 9, 12).getTimezoneOffset(),
       }));`,
      { env: { TZ: zone } }
    )
  );

test('export times are read in the machine time zone, not UTC', () => {
  const zones = [
    ['Asia/Bangkok', -420, '2026-10-12T07:32:00.000Z'],
    ['UTC', 0, '2026-10-12T14:32:00.000Z'],
    ['America/Los_Angeles', 420, '2026-10-12T21:32:00.000Z'],
  ];
  for (const [zone, offset, instant] of zones) {
    const out = parseIn(zone);
    assert.equal(out.stamps[0], out.local, zone);
    if (out.offset === offset) {
      assert.equal(out.stamps[0], instant, zone);
    }
  }
});
