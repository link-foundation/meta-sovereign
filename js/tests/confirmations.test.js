// Nothing is written to another service without the user's explicit
// confirmation: single-use tokens bound to the exact request, sync
// sockets closed to other websites, "typing…" off until switched on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

import {
  createConfirmations,
  withoutToken,
} from '../src/server/confirmations.js';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/index.js';
import { readShareTyping, writeShareTyping } from '../src/web/privacy-prefs.js';
import { confirmCli } from '../src/cli/confirm.js';

test('a token works once, for the same action and body only', () => {
  let now = 1000;
  const c = createConfirmations({ ttlMs: 50, now: () => now });
  const body = { to: 'bob', text: 'hi', nested: { a: 1, b: 2 } };
  const { token } = c.issue('email.send', body, { plan: 1 });
  // Key order does not matter, the action and the content do.
  assert.equal(c.consume(token, 'github.send', body), null);
  const again = c.issue('email.send', body).token;
  assert.equal(c.consume(again, 'email.send', { ...body, to: 'eve' }), null);
  const third = c.issue('email.send', body, { plan: 3 }).token;
  assert.deepEqual(
    c.consume(third, 'email.send', {
      nested: { b: 2, a: 1 },
      text: 'hi',
      to: 'bob',
    }),
    { data: { plan: 3 } }
  );
  assert.equal(c.consume(third, 'email.send', body), null, 'single use');
  const late = c.issue('email.send', body).token;
  now += 51;
  assert.equal(c.consume(late, 'email.send', body), null, 'expired');
  assert.equal(c.consume(undefined, 'email.send', body), null);
  assert.deepEqual(withoutToken({ a: 1, confirmToken: 'x' }), { a: 1 });
});

test('a bounded preview cache evicts the oldest plan and drops expired plans', () => {
  let now = 1000;
  const confirmations = createConfirmations({
    maxPending: 2,
    ttlMs: 50,
    now: () => now,
  });
  const first = confirmations.issue('import', {}, 'oldest');
  const second = confirmations.issue('import', {}, 'second');
  const third = confirmations.issue('import', {}, 'third');
  assert.equal(confirmations.consume(first.token, 'import', {}), null);
  assert.deepEqual(confirmations.consume(second.token, 'import', {}), {
    data: 'second',
  });
  now += 51;
  confirmations.issue('import', {}, 'fresh');
  assert.equal(confirmations.consume(third.token, 'import', {}), null);
});

// Raw upgrade request: the status line tells whether the socket opened.
const upgradeStatus = (port, path, origin) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(
        [
          `GET ${path} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version: 13',
          ...(origin ? [`Origin: ${origin}`] : []),
          '',
          '',
        ].join('\r\n')
      );
    });
    socket.once('data', (chunk) => {
      resolve(chunk.toString().split('\r\n')[0]);
      socket.destroy();
    });
    socket.on('error', reject);
  });

test('other websites cannot open the sync or signalling sockets', async () => {
  const handle = await startServer({ port: 0, store: createMemoryStore() });
  const { port } = handle;
  try {
    for (const path of ['/ws', '/rtc']) {
      assert.match(
        await upgradeStatus(port, path, 'https://evil.example'),
        / 403 /
      );
      assert.match(await upgradeStatus(port, path, null), / 101 /);
      assert.match(
        await upgradeStatus(port, path, `http://127.0.0.1:${port}`),
        / 101 /
      );
      assert.match(
        await upgradeStatus(port, path, 'https://link-foundation.github.io'),
        / 101 /
      );
    }
  } finally {
    await handle.close();
  }
});

test('sharing "typing…" is off until the user turns it on', () => {
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  assert.equal(readShareTyping(storage), false);
  writeShareTyping(true, storage);
  assert.equal(readShareTyping(storage), true);
  writeShareTyping(false, storage);
  assert.equal(readShareTyping(storage), false);
  assert.equal(
    readShareTyping({
      getItem: () => {
        throw new Error('blocked');
      },
    }),
    false
  );
});

test('CLI writes need --yes, a y on a terminal, or an injected answer', async () => {
  const lines = [];
  const log = (line) => lines.push(line);
  const notTty = { isTTY: false };
  assert.equal(await confirmCli('Send?', { log, input: notTty }), false);
  assert.match(lines[0], /pass --yes/);
  assert.equal(await confirmCli('Send?', { args: { yes: true } }), true);
  assert.equal(await confirmCli('Send?', { args: { yes: 'true' } }), true);
  assert.equal(await confirmCli('Send?', { ask: async () => false }), false);
  assert.equal(await confirmCli('Send?', { ask: async () => true }), true);
});

test('outreach previews freely but sends only with a token', async () => {
  const handle = await startServer({ port: 0, store: createMemoryStore() });
  const base = `http://127.0.0.1:${handle.port}`;
  const post = async (body) => {
    const res = await fetch(`${base}/api/outreach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    const preview = await post({ query: '', text: 'hi', mode: 'preview' });
    assert.equal(preview.status, 200);
    const queue = await post({ query: '', text: 'hi', mode: 'queue' });
    assert.equal(queue.status, 428);
    assert.deepEqual(queue.body.preview.envelopes, []);
    const forged = await post({
      query: '',
      text: 'hi',
      mode: 'queue',
      confirmToken: 'guess',
    });
    assert.equal(forged.status, 428);
    assert.match(forged.body.error, /expired or does not match/);
  } finally {
    await handle.close();
  }
});
