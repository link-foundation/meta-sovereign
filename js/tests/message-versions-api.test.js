// Headless Telegram updates, then local-only reads: no browser or provider is
// required to retain and inspect edits. Fixtures never use a personal account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';

const boot = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-versions-api-'));
  const server = await startServer({
    port: 0,
    storeDir: dir,
    store: createMemoryStore(),
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    log: null,
    automations: { scheduler: false },
  });
  const base = `http://127.0.0.1:${server.port}`;
  return {
    server,
    base,
    close: async () => {
      await server.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
};
const update = (body, extra = {}) => ({
  className: extra.editDate ? 'UpdateEditMessage' : 'UpdateNewMessage',
  message: {
    className: 'Message',
    id: 1,
    date: 1793181600,
    peerId: { className: 'PeerUser', userId: 42 },
    fromId: { className: 'PeerUser', userId: 42 },
    message: body,
    ...extra,
  },
});

test('headless live updates preserve edits and deletions, exposed locally without reconnecting Telegram', async () => {
  const { server, base, close } = await boot();
  try {
    let callback;
    const client = {
      addEventHandler: (fn) => {
        callback = fn;
      },
    };
    const live = createTelegramLive({
      store: server.store,
      toLinks: telegramDialogLinks,
    });
    live.attach(client);
    await callback(update('original text'));
    await callback(
      update('changed text', {
        editDate: 1793181660,
        entities: [{ className: 'MessageEntityBold', offset: 0, length: 7 }],
      })
    );
    await callback({ className: 'UpdateDeleteMessages', messages: [1] });
    const get = async (route) => {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      return response.json();
    };
    const edited = await get('/api/chat/edited?key=telegram:42');
    assert.equal(edited.count, 1);
    const id = edited.messages[0].id;
    const history = await get(
      `/api/chat/versions?id=${encodeURIComponent(id)}`
    );
    assert.deepEqual(
      history.versions.map((record) => record.snapshot.body),
      ['changed text', 'original text']
    );
    assert.equal(history.versions[0].snapshot.raw.entities[0].length, 7);
    assert.equal(history.partial, false);
    assert.equal(
      (await get('/api/chat/messages?key=telegram:42')).messages.length,
      0
    );
    assert.equal(
      (await get('/api/chat/deleted?key=telegram:42')).messages.length,
      1
    );
    assert.equal(
      (await get('/api/chat/edited?key=telegram:42&count=1')).count,
      1
    );
    assert.equal(
      (await get('/links?except=msg:')).some(
        (link) => link.kind === 'message-version'
      ),
      false
    );
    for (const method of ['PUT', 'DELETE']) {
      const record = history.versions[0];
      const response = await fetch(
        base +
          (method === 'PUT'
            ? '/links'
            : `/links/${encodeURIComponent(record.id)}?purge=1&confirm=1`),
        {
          method,
          headers: { 'content-type': 'application/json' },
          ...(method === 'PUT'
            ? {
                body: JSON.stringify({
                  ...record,
                  snapshot: { body: 'tampered' },
                }),
              }
            : {}),
        }
      );
      assert.equal(
        response.status,
        400,
        'raw link routes cannot alter saved revisions'
      );
    }
    const purged = await fetch(`${base}/api/chat/deleted/purge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [id], confirm: true }),
    });
    assert.equal(purged.status, 200);
    assert.equal(
      (await get('/api/chat/edited?key=telegram:42&count=1')).count,
      0
    );
    assert.equal(
      (await fetch(`${base}/api/chat/versions?id=${encodeURIComponent(id)}`))
        .status,
      404
    );
  } finally {
    await close();
  }
});

test('history pages retain their order; old edited messages disclose uncaptured versions', async () => {
  const { server, base, close } = await boot();
  try {
    const id = 'msg:telegram:42:1';
    for (let number = 0; number < 55; number += 1) {
      await server.store.put({
        id,
        source: 'telegram',
        chat: '42',
        body: `version ${number}`,
      });
    }
    const first = await (
      await fetch(`${base}/api/chat/versions?id=${id}`)
    ).json();
    assert.equal(first.versions.length, 50);
    assert.equal(first.count, 55);
    const second = await (
      await fetch(
        `${base}/api/chat/versions?id=${id}&before=${encodeURIComponent(first.next)}`
      )
    ).json();
    assert.equal(second.versions.length, 5);
    assert.equal(second.next, null);
    assert.deepEqual(
      [...first.versions, ...second.versions].map((item) => item.snapshot.body),
      Array.from({ length: 55 }, (_, i) => `version ${54 - i}`)
    );
    const legacyId = 'msg:telegram:42:2';
    await server.store.put({
      id: legacyId,
      source: 'telegram',
      chat: '42',
      body: 'first observed',
      edited: '2026-10-28T10:00:00Z',
    });
    const legacy = await (
      await fetch(`${base}/api/chat/versions?id=${legacyId}`)
    ).json();
    assert.equal(legacy.partial, true);
    assert.equal(legacy.versions[0].capturedAt, null);
    await server.store.put({
      ...legacy.message,
      body: 'another observed edit',
    });
    const later = await (
      await fetch(`${base}/api/chat/versions?id=${legacyId}`)
    ).json();
    assert.equal(
      later.partial,
      true,
      'capturing later edits does not invent the missing original'
    );
    assert.equal(later.count, 2);
    const unrelated = await (
      await fetch(
        `${base}/api/chat/versions?id=${legacyId}&before=${encodeURIComponent(first.next)}`
      )
    ).json();
    assert.deepEqual(
      unrelated.versions,
      [],
      'a cursor cannot read another message'
    );
    assert.equal(
      (await fetch(`${base}/api/chat/versions?id=secret:token`)).status,
      400
    );
  } finally {
    await close();
  }
});
