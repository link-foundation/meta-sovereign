// GramJS at Telegram's current API layer (R-Y76): the schema Telegram
// publishes, turned into the TL text GramJS parses, replaces GramJS's
// older copy before it loads, so new polls, checklists and newer media
// are no longer "unsupported". What older versions stored as
// unsupported is read again once. Synthetic data and fakes only — no
// network; GramJS is loaded only in a child process, offline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

import { schemaToTl, tdlibToTl, tlLine } from '../scripts/telegram-schema.mjs';
import { LAYER } from '../src/sources/telegram-layer.js';
import { rereadUnsupported } from '../src/sources/telegram-repair.js';
import { createMemoryStore } from '../src/storage/universal.js';

const require = createRequire(import.meta.url);
const SOURCES = new URL('../src/sources/', import.meta.url);
const shipped = () =>
  readFileSync(new URL(`telegram-api/layer-${LAYER}.tl`, SOURCES), 'utf8');

test('the published schema becomes the TL lines GramJS reads', () => {
  assert.equal(
    tlLine(
      {
        id: '-571955892',
        predicate: 'inputPeerUser',
        params: [
          { name: 'user_id', type: 'long' },
          { name: 'access_hash', type: 'long' },
        ],
        type: 'InputPeer',
      },
      'predicate'
    ),
    'inputPeerUser#dde8a54c user_id:long access_hash:long = InputPeer;'
  );
  assert.equal(
    tlLine(
      {
        id: '-627372787',
        method: 'invokeWithLayer',
        params: [
          { name: 'layer', type: 'int' },
          { name: 'query', type: '!X' },
        ],
        type: 'X',
      },
      'method'
    ),
    'invokeWithLayer#da9b0d0d {X:Type} layer:int query:!X = X;'
  );
  const tl = schemaToTl(
    {
      constructors: [
        { id: '481674261', predicate: 'vector', params: [], type: 'Vector t' },
      ],
      methods: [],
    },
    7
  );
  assert.match(tl, /^\/\/ Telegram API layer 7/);
  assert.match(tl, /vector#1cb5c415 \{t:Type\} # \[ t \] = Vector t;/);
  assert.match(tl, /---functions---/);
});

test("TDLib's schema becomes the same TL, without TDLib's own calls", () => {
  const tl = tdlibToTl(
    [
      'int ? = Int;',
      'test.useError = Error;',
      '---functions---',
      'test.useConfigSimple = help.ConfigSimple;',
      '---types---',
      '// a comment',
      'boolFalse#bc799737 = Bool;',
      '  messages.chatInviteJoinResultOk#445663a7 updates:Updates = messages.ChatInviteJoinResult;',
      '---functions---',
      'help.getConfig#c4f9186b = Config;',
      '',
    ].join('\n'),
    232
  );
  assert.deepEqual(tl.split('\n'), [
    "// Telegram API layer 232, from TDLib's telegram_api.tl",
    'boolFalse#bc799737 = Bool;',
    'messages.chatInviteJoinResultOk#445663a7 updates:Updates = messages.ChatInviteJoinResult;',
    '',
    '---functions---',
    '',
    'help.getConfig#c4f9186b = Config;',
    '',
  ]);
});

test('the shipped layer parses in GramJS, new polls and checklists too', () => {
  const { parseTl } = require('telegram/tl/generationHelpers.js');
  const all = [...parseTl(shipped(), LAYER)];
  const named = (name, ns) =>
    all.find((o) => o.name === name && (o.namespace ?? null) === ns);
  assert.ok(all.length > 2000);
  assert.equal(
    named('MessageMediaPoll', null).constructorId.toString(16),
    '773f4e66'
  );
  assert.ok(named('MessageMediaToDo', null));
  assert.ok(named('SendVote', 'messages').isFunction);
});

// Spawns Node with a fresh module cache (Deno and Bun run the rest).
const onNode = !globalThis.Deno && !globalThis.Bun;

test(
  'GramJS loads at the current layer, before anything else loads it',
  { skip: onNode ? false : 'needs Node to spawn' },
  () => {
    const layerModule = new URL('telegram-layer.js', SOURCES).href;
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(layerModule)});
       const { Api } = await m.importTelegram();
       const { createRequire } = await import('node:module');
       const all = createRequire(${JSON.stringify(layerModule)})('telegram/tl/AllTLObjects.js');
       console.log(JSON.stringify({
         installed: m.installTelegramLayer(),
         layer: all.LAYER,
         poll: Api.MessageMediaPoll.CONSTRUCTOR_ID.toString(16),
         todo: typeof Api.MessageMediaToDo,
       }));`,
      ],
      { encoding: 'utf8' }
    );
    const got = JSON.parse(out.trim().split('\n').pop());
    assert.equal(got.layer, LAYER);
    assert.equal(got.installed.layer, LAYER);
    assert.ok(got.installed.from < LAYER);
    assert.equal(got.poll, '773f4e66');
    assert.equal(got.todo, 'function');
  }
);

test('every Api method and class our Telegram code names exists', () => {
  const { parseTl } = require('telegram/tl/generationHelpers.js');
  const core = require('telegram/tl/schemaTl.js');
  const known = new Set(
    [...parseTl(shipped(), LAYER), ...parseTl(core, LAYER)].map((o) =>
      o.namespace ? `${o.namespace}.${o.name}` : o.name
    )
  );
  const missing = [];
  for (const file of readdirSync(SOURCES).filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(new URL(file, SOURCES), 'utf8');
    for (const [, name] of text.matchAll(/\bApi\.((?:[a-z]\w*\.)?[A-Z]\w*)/g)) {
      if (!known.has(name)) {
        missing.push(`${file}: Api.${name}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

const unsupported = (chat, id) => ({
  id: `msg:telegram:${chat}:${id}`,
  source: 'telegram',
  chat,
  body: '📎',
  raw: { id, media: { className: 'MessageMediaUnsupported' } },
});

test('what was stored as unsupported is read again once, a chat at a time', async () => {
  const store = createMemoryStore();
  for (const link of [
    unsupported('-1001', 5),
    unsupported('-1001', 9),
    unsupported('42', 3),
    { ...unsupported('42', 4), deleted: true },
    {
      id: 'msg:telegram:42:6',
      chat: '42',
      raw: { media: { className: 'MessageMediaPhoto' } },
    },
  ]) {
    await store.put(link);
  }
  const asked = [];
  const logged = [];
  const refresh = async ({ chat, ids, priority }) => {
    asked.push([chat, ids, priority]);
    // Telegram now says what it is.
    for (const id of ids) {
      const link = await store.get(`msg:telegram:${chat}:${id}`);
      await store.put({
        ...link,
        raw: { ...link.raw, media: { className: 'MessageMediaToDo' } },
      });
    }
  };
  // A failed chat leaves no marker: the next start asks again.
  const flaky = async () => {
    throw new Error('Telegram asked to wait');
  };
  await rereadUnsupported(store, { refresh: flaky, layer: 225 });
  assert.equal(await store.get('repair:telegram:unsupported-layer-225'), null);
  assert.equal(
    await rereadUnsupported(store, {
      refresh,
      layer: 225,
      log: (e) => logged.push(e),
    }),
    3
  );
  assert.deepEqual(asked, [
    ['-1001', [5, 9], 'prefetch'],
    ['42', [3], 'prefetch'],
  ]);
  assert.equal(logged[0].left, 0);
  assert.equal(logged[0].chats, 2);
  assert.equal(await rereadUnsupported(store, { refresh, layer: 225 }), 0);
  assert.equal(asked.length, 2);
});

test('a chat Telegram cannot address does not keep the repair coming back', async () => {
  const store = createMemoryStore();
  await store.put(unsupported('-1001', 5));
  await store.put(unsupported('77', 2));
  const logged = [];
  const refresh = async ({ chat }) => {
    if (chat === '77') {
      throw new Error('Could not find the input entity for {"userId":"77"}');
    }
  };
  await rereadUnsupported(store, {
    refresh,
    layer: 225,
    log: (e) => logged.push(e),
  });
  assert.equal(logged[0].failed, 0);
  assert.equal(logged[0].unreachable, 1);
  assert.ok(await store.get('repair:telegram:unsupported-layer-225'));
});
