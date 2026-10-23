// R-Z7: deleted messages have one shape (isTombstone knows them all), and
// the user can list, recover and purge them (local actions only).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  isTombstone,
  markDeleted,
  unmarkDeleted,
  deletedAtOf,
} from '../src/storage/soft-delete.js';
import { createMemoryStore } from '../src/storage/index.js';
import { startServer } from '../src/server/index.js';
import { facebookWebhookToLinks } from '../src/sources/facebook.js';

const msg = (n, extra = {}) => ({
  id: `msg:telegram:42:${n}`,
  source: 'telegram',
  chat: '42',
  body: `hello ${n}`,
  timestamp: `2026-01-0${n}T10:00:00Z`,
  ...extra,
});

test('isTombstone knows every shape the app has written', () => {
  assert.equal(isTombstone(msg(1)), false);
  assert.equal(isTombstone(msg(1, { deleted: false })), false);
  assert.equal(isTombstone(msg(1, { deleted: null })), false);
  assert.equal(isTombstone(msg(1, { deleted: true })), true);
  assert.equal(
    isTombstone(msg(1, { deleted: { at: 'x', by: 'u', reason: null } })),
    true
  );
  assert.equal(
    isTombstone(msg(1, { deleted: true, deletedAt: '2026-01-01T00:00:00Z' })),
    true
  );
  assert.equal(isTombstone(null), false);
});

test('markDeleted turns an old boolean tombstone into the one shape', () => {
  const old = msg(1, { deleted: true, deletedAt: '2026-02-02T00:00:00Z' });
  const next = markDeleted(old, { by: 'user' });
  assert.equal(next.deletedAt, undefined);
  assert.deepEqual(next.deleted, {
    at: '2026-02-02T00:00:00Z',
    by: 'user',
    reason: null,
  });
  assert.equal(deletedAtOf(old), '2026-02-02T00:00:00Z');
  assert.equal(deletedAtOf(next), '2026-02-02T00:00:00Z');
  assert.deepEqual(unmarkDeleted(next), msg(1));
});

test('a Facebook archive message flagged deleted is a tombstone', () => {
  const [link] = facebookWebhookToLinks({
    entry: [
      {
        messaging: [
          {
            sender: { id: 'a' },
            recipient: { id: 'b' },
            timestamp: 1,
            message: { mid: 'm1', text: 'x', is_deleted: true },
          },
        ],
      },
    ],
  });
  assert.equal(isTombstone(link), true);
});

const boot = async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-z7-del-'));
  const server = await startServer({
    port: 0,
    storeDir,
    store: createMemoryStore(),
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false },
    log: null,
  });
  const base = `http://127.0.0.1:${server.port}`;
  const post = (route, body) =>
    fetch(base + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  return { server, base, post };
};

test('list, recover and purge deleted messages of a chat', async () => {
  const { server, base, post } = await boot();
  try {
    const { store } = server;
    await store.put(msg(1));
    await store.put(msg(2, { deleted: true }));
    await store.put(
      msg(3, { deleted: { at: '2026-03-03T00:00:00Z', by: 'user' } })
    );
    await store.put(msg(4, { deleted: true, deletedAt: '2026-03-04' }));
    await server.chatIndex?.ready?.();
    const key = 'telegram:42';
    let res = await fetch(`${base}/api/chat/deleted?key=${key}`);
    let body = await res.json();
    assert.deepEqual(
      body.messages.map((m) => m.id),
      [msg(2).id, msg(3).id, msg(4).id]
    );
    // The shown chat holds only the live message.
    res = await fetch(`${base}/api/chat/messages?key=${key}`);
    assert.deepEqual(
      (await res.json()).messages.map((m) => m.id),
      [msg(1).id]
    );

    res = await post('/api/chat/deleted/recover', {
      ids: [msg(2).id, msg(1).id],
    });
    body = await res.json();
    // Only a deleted message is recovered; a live one is left alone.
    assert.deepEqual(body.recovered, [msg(2).id]);
    assert.equal(isTombstone(await store.get(msg(2).id)), false);
    res = await fetch(`${base}/api/chat/messages?key=${key}`);
    assert.equal((await res.json()).messages.length, 2);

    res = await post('/api/chat/deleted/purge', { ids: [msg(3).id] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'confirm-required');
    assert.ok(await store.get(msg(3).id));

    res = await post('/api/chat/deleted/purge', {
      ids: [msg(3).id, msg(1).id],
      confirm: true,
    });
    assert.deepEqual((await res.json()).purged, [msg(3).id]);
    assert.equal(await store.get(msg(3).id), null);
    assert.ok(await store.get(msg(1).id), 'a live message is never purged');
    res = await fetch(`${base}/api/chat/deleted?key=${key}`);
    assert.deepEqual(
      (await res.json()).messages.map((m) => m.id),
      [msg(4).id]
    );

    res = await post('/api/chat/deleted/recover', { ids: ['secret:x'] });
    assert.equal(res.status, 400);
    res = await post('/api/chat/deleted/recover', {});
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});
