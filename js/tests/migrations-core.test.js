// The migration contract (R-Z17): batches, counting, dry run, idempotency,
// the rekey helper, the browser adapter and the peer handshake.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import { createBrowserStore } from '../src/storage/browser-store.js';
import {
  SCHEMA_ID,
  runMigrations,
  versionOf,
} from '../src/storage/migrations/index.js';
import { migrateBrowserStore } from '../src/storage/migrations/browser-runner.js';
import { createPeer, loopback } from '../src/sync/peer.js';

const link = (id, extra = {}) => ({ id, tokens: ['t'], ...extra });

const seeded = async (count = 5) => {
  const store = createMemoryStore();
  await store.putMany(
    Array.from({ length: count }, (_, n) => link(`msg:x:${n}`, { n }))
  );
  return store;
};

const bump = {
  id: '0001-bump',
  from: 0,
  to: 1,
  description: 'adds seen:true to every msg:x link',
  async up(ctx) {
    await ctx.scan({ prefix: 'msg:x:', batchSize: 2 }, async (batch) => {
      await ctx.putMany(batch.map((l) => ({ ...l, seen: true })));
    });
  },
};

test('scan hands out copies in batches; changed counts only real changes', async () => {
  const store = await seeded(5);
  const batches = [];
  const spy = {
    ...bump,
    async up(ctx) {
      await ctx.scan({ prefix: 'msg:x:', batchSize: 2 }, async (batch) => {
        batches.push(batch.length);
        await ctx.putMany(batch.map((l) => ({ ...l, seen: true })));
      });
      // The same again: nothing differs, nothing is counted.
      await ctx.scan({ prefix: 'msg:x:' }, async (batch) => {
        await ctx.putMany(batch.map((l) => ({ ...l, seen: true })));
      });
    },
  };
  const events = [];
  const summary = await runMigrations(store, {
    migrations: [spy],
    onEvent: (e) => events.push(e),
  });
  assert.deepEqual(batches, [2, 2, 1]);
  assert.equal(summary.steps[0].changed, 5);
  assert.equal(summary.steps[0].scanned, 10);
  assert.equal(versionOf(await store.get(SCHEMA_ID)), 1);
  assert.deepEqual(
    events.filter((e) => e.event === 'migration_step').map((e) => e.id),
    ['0001-bump']
  );
});

test('run again, nothing changes (idempotent); the history is kept', async () => {
  const store = await seeded(3);
  await runMigrations(store, { migrations: [bump] });
  const before = JSON.stringify(await store.query());
  const again = await runMigrations(store, { migrations: [bump] });
  assert.deepEqual(again.steps, []);
  // Forced from 0 (a restored old backup): the same result, 0 changed.
  const forced = await runMigrations(store, { migrations: [bump], from: 0 });
  assert.equal(forced.steps[0].changed, 0);
  const after = await store.get(SCHEMA_ID);
  assert.equal(after.version, 1);
  assert.equal(after.applied.length, 2);
  assert.equal(
    JSON.stringify((await store.query()).filter((l) => l.id !== SCHEMA_ID)),
    JSON.stringify(JSON.parse(before).filter((l) => l.id !== SCHEMA_ID))
  );
});

test('a dry run counts and writes nothing', async () => {
  const store = await seeded(4);
  const before = JSON.stringify(await store.query());
  const summary = await runMigrations(store, {
    migrations: [bump],
    dryRun: true,
  });
  assert.equal(summary.steps[0].changed, 4);
  assert.equal(JSON.stringify(await store.query()), before);
  assert.equal(await store.get(SCHEMA_ID), null);
});

test('a failing migration is reported with its id', async () => {
  const store = await seeded(2);
  const boom = {
    ...bump,
    async up() {
      throw new Error('boom');
    },
  };
  await assert.rejects(runMigrations(store, { migrations: [boom] }), {
    code: 'MIGRATION_FAILED',
    migration: '0001-bump',
  });
});

test('ctx.log keeps numbers only, never content', async () => {
  const store = await seeded(1);
  const events = [];
  await runMigrations(store, {
    migrations: [
      {
        ...bump,
        async up(ctx) {
          ctx.log('migration_note', { seen: 3, body: 'secret text' });
        },
      },
    ],
    onEvent: (e) => events.push(e),
  });
  const note = events.find((e) => e.event === 'migration_note');
  assert.equal(note.seen, 3);
  assert.equal('body' in note, false);
});

test('rekey: the link moves, an alias remembers it, references resolve', async () => {
  const store = createMemoryStore();
  await store.putMany([
    link('chat:wa:Anna', { title: 'Anna' }),
    link('msg:wa:1', {
      chat: 'chat:wa:Anna',
      children: ['chat:wa:Anna', 'body:wa:1'],
      replyTo: 'msg:wa:0',
    }),
    link('msg:wa:2', { children: ['replyto:wa:1'], replyTo: 'msg:wa:1' }),
  ]);
  let resolved;
  const rekey = {
    id: '0001-rekey',
    from: 0,
    to: 1,
    description: 'chat ids by number, message ids prefixed',
    async up(ctx) {
      await ctx.rekeyMany(
        [
          ['chat:wa:Anna', 'chat:wa:+491701'],
          ['msg:wa:1', 'msg:wa:one'],
        ],
        { fields: ['replyTo', 'chat'] }
      );
      resolved = await ctx.resolve('msg:wa:1');
    },
  };
  const summary = await runMigrations(store, { migrations: [rekey] });
  assert.ok(summary.steps[0].changed > 0);
  assert.equal(resolved, 'msg:wa:one');
  assert.equal(await store.get('msg:wa:1'), null, 'the old id is gone');
  assert.equal((await store.get('msg:wa:one')).id, 'msg:wa:one');
  assert.equal((await store.get('alias:msg:wa:1')).to, 'msg:wa:one');
  // The reply still points at a link that exists.
  assert.equal((await store.get('msg:wa:2')).replyTo, 'msg:wa:one');
  // The moved message points at the moved chat; its children follow.
  const moved = await store.get('msg:wa:one');
  assert.equal(moved.chat, 'chat:wa:+491701');
  assert.deepEqual(moved.children, ['chat:wa:+491701', 'body:wa:1']);
  // Run again: nothing changes.
  const again = await runMigrations(store, { migrations: [rekey], from: 0 });
  assert.equal(again.steps[0].changed, 0);
});

test('rekey never overwrites a different link under the new id', async () => {
  const store = createMemoryStore();
  await store.putMany([link('a', { v: 1 }), link('b', { v: 2 })]);
  let conflicts = 0;
  await runMigrations(store, {
    migrations: [
      {
        id: '0001-clash',
        from: 0,
        to: 1,
        description: 'moves a onto b',
        async up(ctx) {
          await ctx.rekey('a', 'b');
          conflicts = ctx.stats.conflicts;
        },
      },
    ],
  });
  assert.equal(conflicts, 1);
  assert.equal((await store.get('a')).v, 1);
  assert.equal((await store.get('b')).v, 2);
});

// A fake browser store: the real one over an in-memory driver, whose saves
// are counted.
const fakeBrowser = async (links = []) => {
  let saves = 0;
  let snapshot = { links };
  const driver = {
    load: async () => snapshot,
    save: async (next) => {
      saves += 1;
      snapshot = JSON.parse(JSON.stringify(next));
    },
  };
  const store = await createBrowserStore({ driver });
  return { store, driver, saves: () => saves, snapshot: () => snapshot };
};

test('the browser adapter runs the same modules over the page store', async () => {
  const { store, snapshot } = await fakeBrowser([
    link('msg:email:a', {
      source: 'email',
      protocol: 'rfc822',
      subject: 'Hi',
      timestamp: 'Tue, 02 Jan 2024 10:00:00 +0000',
      rawHeaders: { 'message-id': ['<a@x>'] },
      children: ['sender:email:s', 'chat:email:Hi', 'body:email:a'],
      chat: 'Hi',
    }),
  ]);
  const events = [];
  const result = await migrateBrowserStore(store, {
    onEvent: (e) => events.push(e.event),
  });
  assert.equal(result.migrated.to, 1);
  assert.deepEqual(events.slice(0, 1), ['migration_started']);
  const mail = await store.get('msg:email:a');
  assert.equal(mail.timestamp, '2024-01-02T10:00:00.000Z');
  assert.equal(mail.chat, 'a@x');
  // Saved: the snapshot the driver holds carries the new version.
  assert.equal(snapshot().links.find((l) => l.id === SCHEMA_ID).version, 1);
  // A second load does nothing.
  assert.equal((await migrateBrowserStore(store)).migrated, null);
});

test('the browser adapter refuses a store from a newer build and leaves it alone', async () => {
  const { store, saves } = await fakeBrowser([
    { id: SCHEMA_ID, tokens: ['meta', 'schema'], version: 99, applied: [] },
    link('x'),
  ]);
  await assert.rejects(migrateBrowserStore(store), { code: 'STORE_TOO_NEW' });
  assert.equal(saves(), 0);
});

test('an empty browser store is stamped without running anything', async () => {
  const { store } = await fakeBrowser();
  const result = await migrateBrowserStore(store);
  assert.equal(result.version, 1);
  assert.equal(result.migrated, null);
});

const pair = async (a, b) => {
  const wire = loopback();
  const errors = { a: [], b: [] };
  const peerA = createPeer(a.store, {
    node: 'a',
    schemaVersion: a.version,
    onMismatch: (e) => errors.a.push(e),
  });
  const peerB = createPeer(b.store, {
    node: 'b',
    schemaVersion: b.version,
    onMismatch: (e) => errors.b.push(e),
  });
  peerA.connect(wire.a);
  peerB.connect(wire.b);
  return { wire, errors };
};

test('peers of the same schema sync; their meta:schema links stay home', async () => {
  const a = { store: createMemoryStore(), version: 2 };
  const b = { store: createMemoryStore(), version: 2 };
  const { wire, errors } = await pair(a, b);
  await a.store.put(link('l:1'));
  await a.store.put({ id: SCHEMA_ID, tokens: ['meta', 'schema'], version: 2 });
  await wire.settle();
  assert.equal((await b.store.get('l:1')).id, 'l:1');
  assert.equal(await b.store.get(SCHEMA_ID), null);
  assert.deepEqual(errors, { a: [], b: [] });
});

test('peers of different schemas refuse each other and exchange nothing', async () => {
  // The loopback has no buffer, so the side that connects second is the
  // one whose hello the other hears; both orders are tried.
  const newer = { store: createMemoryStore(), version: 3 };
  const older = { store: createMemoryStore(), version: 2 };
  const first = await pair(newer, older);
  await newer.store.put(link('l:from-new'));
  await older.store.put(link('l:from-old'));
  await first.wire.settle();
  assert.equal(await older.store.get('l:from-new'), null);
  assert.equal(await newer.store.get('l:from-old'), null);
  const error = first.errors.a[0];
  assert.equal(error.code, 'SCHEMA_MISMATCH');
  assert.equal(error.local, 3);
  assert.equal(error.remote, 2);
  assert.match(error.message, /schema 3, the other side at 2/);
  assert.match(error.message, /the other side must update/);
  // From the older side's point of view it is itself that must update.
  const second = await pair(
    { store: createMemoryStore(), version: 2 },
    { store: createMemoryStore(), version: 3 }
  );
  assert.match(second.errors.a[0].message, /this side must update/);
});

test('a peer that does not speak schemas (an older build) is refused too', async () => {
  const wire = loopback();
  const store = createMemoryStore();
  const errors = [];
  createPeer(store, {
    schemaVersion: 1,
    onMismatch: (e) => errors.push(e),
  }).connect(wire.a);
  // An old build: no schema on its events.
  wire.b.send({ type: 'put', link: link('l:old') });
  await wire.settle();
  assert.equal(await store.get('l:old'), null);
  assert.equal(errors[0].remote, null);
  assert.match(errors[0].message, /unversioned/);
});
