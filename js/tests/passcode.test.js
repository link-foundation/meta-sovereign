// The local passcode (R-Y183): the salted hash, the lock and its rate limit,
// the server's gate (423 on every route but status and unlock), the CLI's
// way out, and the page's pure helpers. A temporary store directory; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  PASSCODE_FILE,
  clearPasscode,
  createPasscodeLock,
  delayAfter,
  hashPasscode,
  verifyPasscode,
} from '../src/server/passcode.js';
import { startServer } from '../src/server/index.js';
import { runCli } from '../src/cli/index.js';
import { idleExpired, isLockKey } from '../src/web/passcode.js';
import { passcodeProblem } from '../src/web/chat-passcode.js';
import {
  neighbour,
  savedChat,
  shortcutOf,
  unreadNeighbour,
} from '../src/web/shortcuts.js';

// A cheap cost keeps the tests fast; the real default is stronger.
const COST = { N: 1024, r: 8, p: 1 };
const tmp = () => mkdtemp(path.join(os.tmpdir(), 'ms-passcode-'));

test('a hash is salted and never holds the passcode', async () => {
  const a = await hashPasscode('hunter2', COST);
  const b = await hashPasscode('hunter2', COST);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.ok(!JSON.stringify(a).includes('hunter2'));
  assert.equal(await verifyPasscode(a, 'hunter2'), true);
  assert.equal(await verifyPasscode(a, 'hunter3'), false);
  assert.equal(await verifyPasscode(null, 'hunter2'), false);
  assert.equal(await verifyPasscode(a, 7), false);
});

test('the delay after a miss grows and is capped', () => {
  assert.deepEqual([1, 2, 3, 4].map(delayAfter), [0, 1000, 2000, 4000]);
  assert.equal(delayAfter(40), 60_000);
});

test('without a passcode nothing is locked', () => {
  const lock = createPasscodeLock({ dir: '/nonexistent-ms-dir', cost: COST });
  assert.equal(lock.locked(), false);
  assert.equal(lock.status().enabled, false);
  assert.equal(lock.lock(), false);
});

test('set, lock, unlock, change and remove', async () => {
  const dir = await tmp();
  let clock = 1000;
  const lock = createPasscodeLock({ dir, now: () => clock, cost: COST });
  assert.deepEqual(await lock.set({ passcode: 'one' }), { ok: true });
  assert.equal(lock.locked(), false);
  const file = await readFile(path.join(dir, PASSCODE_FILE), 'utf8');
  assert.ok(!file.includes('one"'));
  // Windows has no POSIX owner-only bits (stat reports 0o666): the file's
  // privacy there rests on the user profile's ACLs (R-Z6).
  if (process.platform !== 'win32') {
    assert.equal((await stat(path.join(dir, PASSCODE_FILE))).mode & 0o077, 0);
  }
  let closed = 0;
  lock.onLock(() => (closed += 1));
  assert.equal(lock.lock(), true);
  assert.equal(closed, 1);
  assert.equal(lock.locked(), true);
  assert.equal((await lock.unlock('one')).ok, true);
  assert.equal(lock.locked(), false);
  // Changing asks for the current one.
  assert.equal(
    (await lock.set({ passcode: 'two', current: 'x' })).code,
    'wrong'
  );
  clock += 5000;
  assert.equal((await lock.set({ passcode: 'two', current: 'one' })).ok, true);
  lock.lock();
  assert.equal((await lock.unlock('one')).ok, false);
  clock += 5000;
  assert.equal((await lock.unlock('two')).ok, true);
  assert.equal((await lock.remove('nope')).ok, false);
  clock += 5000;
  assert.equal((await lock.remove('two')).ok, true);
  assert.equal(lock.status().enabled, false);
});

test('a wrong passcode makes the next tries wait, longer each time', async () => {
  const dir = await tmp();
  let clock = 0;
  const lock = createPasscodeLock({ dir, now: () => clock, cost: COST });
  await lock.set({ passcode: 'right' });
  lock.lock();
  assert.equal((await lock.unlock('a')).retryAfterMs, 0);
  const second = await lock.unlock('b');
  assert.equal(second.code, 'wrong');
  assert.equal(second.retryAfterMs, 1000);
  // Inside the wait even the right passcode is not tried.
  const early = await lock.unlock('right');
  assert.equal(early.code, 'rate-limited');
  assert.equal(lock.locked(), true);
  clock += 1000;
  assert.equal((await lock.unlock('c')).retryAfterMs, 2000);
  clock += 2000;
  assert.equal((await lock.unlock('right')).ok, true);
  assert.equal(lock.status().retryAfterMs, 0);
});

test('a restart locks again; clearing the file unlocks at once', async () => {
  const dir = await tmp();
  const first = createPasscodeLock({ dir, cost: COST });
  await first.set({ passcode: 'p' });
  assert.equal(first.locked(), false);
  const restarted = createPasscodeLock({ dir, cost: COST });
  assert.equal(restarted.locked(), true);
  assert.equal(clearPasscode(dir), true);
  assert.equal(restarted.locked(), false);
  assert.equal(clearPasscode(dir), false);
});

const call = (base, method, route, body) =>
  fetch(`${base}${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const serve = async (dir) =>
  startServer({
    port: 0,
    storeDir: dir,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    log: null,
    tls: false,
    automations: { scheduler: false },
  });

test('the server refuses every route but status and unlock while locked', async () => {
  const dir = await tmp();
  const server = await serve(dir);
  const base = `http://127.0.0.1:${server.port}`;
  try {
    // No passcode: open.
    assert.equal((await call(base, 'GET', '/api/status')).status, 200);
    assert.equal(
      (await call(base, 'POST', '/api/passcode/set', { passcode: 'secret' }))
        .status,
      200
    );
    assert.equal((await call(base, 'GET', '/api/status')).status, 200);
    assert.equal(
      (await call(base, 'POST', '/api/passcode/lock', {})).status,
      200
    );
    for (const [method, route] of [
      ['GET', '/api/status'],
      ['GET', '/api/status?probe=1'],
      ['GET', '/api/events'],
      ['POST', '/api/telegram/status'],
      ['GET', '/links'],
      ['POST', '/api/passcode/set'],
      ['POST', '/api/passcode/remove'],
    ]) {
      const res = await call(
        base,
        method,
        route,
        method === 'POST' ? {} : undefined
      );
      assert.equal(res.status, 423, route);
      assert.equal((await res.json()).code, 'locked');
    }
    // The page's own files and the status route stay open.
    assert.equal((await call(base, 'GET', '/')).status, 200);
    const status = await (
      await call(base, 'GET', '/api/passcode/status')
    ).json();
    assert.equal(status.locked, true);
    const wrong = await call(base, 'POST', '/api/passcode/unlock', {
      passcode: 'no',
    });
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).code, 'wrong');
    const waiting = await call(base, 'POST', '/api/passcode/unlock', {
      passcode: 'no',
    });
    assert.ok([401, 429].includes(waiting.status));
    assert.equal(
      (await call(base, 'POST', '/api/passcode/unlock', { passcode: 5 }))
        .status,
      400
    );
  } finally {
    await server.close();
  }
});

test('the stored hash survives a restart as locked, and --clear opens it', async () => {
  const dir = await tmp();
  const first = await serve(dir);
  await call(`http://127.0.0.1:${first.port}`, 'POST', '/api/passcode/set', {
    passcode: 'secret',
  });
  await first.close();
  const out = [];
  const second = await serve(dir);
  const base = `http://127.0.0.1:${second.port}`;
  try {
    assert.equal((await call(base, 'GET', '/api/status')).status, 423);
    assert.equal(await runCli(['passcode'], { log: (m) => out.push(m) }), 1);
    const code = await runCli(['passcode', '--clear', `--store=${dir}`], {
      log: (m) => out.push(m),
    });
    assert.equal(code, 0);
    assert.match(out.at(-1), /cleared/);
    assert.equal((await call(base, 'GET', '/api/status')).status, 200);
  } finally {
    await second.close();
  }
  await runCli(['passcode', '--clear', `--store=${dir}`], {
    log: (m) => out.push(m),
  });
  assert.match(out.at(-1), /no local passcode/);
});

test('open event streams end when the server locks', async () => {
  const dir = await tmp();
  const server = await serve(dir);
  const base = `http://127.0.0.1:${server.port}`;
  try {
    await call(base, 'POST', '/api/passcode/set', { passcode: 'secret' });
    const stream = await call(base, 'GET', '/api/events');
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    await reader.read();
    await call(base, 'POST', '/api/passcode/lock', {});
    let done = false;
    for (let i = 0; i < 20 && !done; i += 1) {
      done = (await reader.read()).done;
    }
    assert.equal(done, true);
  } finally {
    await server.close();
  }
});

test('page helpers: idle time, the lock key and the form', () => {
  assert.equal(idleExpired(0, 59_999, 1), false);
  assert.equal(idleExpired(0, 60_000, 1), true);
  assert.equal(idleExpired(0, 1e12, 0), false);
  assert.equal(isLockKey({ ctrlKey: true, key: 'l' }), true);
  assert.equal(isLockKey({ metaKey: true, key: 'L' }), true);
  assert.equal(isLockKey({ ctrlKey: true, shiftKey: true, key: 'l' }), false);
  assert.equal(isLockKey({ key: 'l' }), false);
  assert.equal(
    passcodeProblem({ passcode: '', repeat: '' }, 'on'),
    'need-passcode'
  );
  assert.equal(
    passcodeProblem({ passcode: 'a', repeat: 'b' }, 'on'),
    'mismatch'
  );
  assert.equal(passcodeProblem({ passcode: 'a', repeat: 'a' }, 'on'), null);
  assert.equal(passcodeProblem({ current: '' }, 'off'), 'need-current');
  assert.equal(
    passcodeProblem({ current: 'a', passcode: 'a', repeat: 'a' }, 'change'),
    'same'
  );
});

test('shortcuts: keys, neighbours and unread', () => {
  const key = (k, extra = {}) => shortcutOf({ key: k, ...extra });
  assert.equal(key('ArrowUp', { altKey: true }), 'prev-chat');
  assert.equal(key('ArrowDown', { altKey: true }), 'next-chat');
  assert.equal(
    key('ArrowDown', { altKey: true, shiftKey: true }),
    'next-unread'
  );
  assert.equal(key('Tab', { ctrlKey: true }), 'next-chat');
  assert.equal(key('Tab', { ctrlKey: true, shiftKey: true }), 'prev-chat');
  assert.equal(key('3', { ctrlKey: true }), 'folder-3');
  assert.equal(key('0', { metaKey: true }), 'saved');
  assert.equal(key('F', { ctrlKey: true, shiftKey: true }), 'search-list');
  // Plain keys, and chords Desktop does not use, are left alone.
  assert.equal(key('ArrowUp'), null);
  assert.equal(key('1'), null);
  assert.equal(key('f', { ctrlKey: true }), null);
  assert.equal(key('ArrowUp', { altKey: true, ctrlKey: true }), null);
  const chats = [
    { key: 'a', unread: 0 },
    { key: 'b', unread: 2 },
    { key: 'c', unread: 0, muted: true },
    { key: 'd', marked: true },
  ];
  assert.equal(neighbour(chats, chats[3], 1).key, 'a');
  assert.equal(neighbour(chats, chats[0], -1).key, 'd');
  assert.equal(neighbour([], null, 1), null);
  assert.equal(unreadNeighbour(chats, chats[0], 1).key, 'b');
  assert.equal(unreadNeighbour(chats, chats[1], 1).key, 'd');
  assert.equal(unreadNeighbour(chats, chats[3], 1).key, 'b');
  assert.equal(unreadNeighbour(chats, chats[0], -1).key, 'd');
  assert.equal(unreadNeighbour([chats[0]], chats[0], 1), null);
  assert.equal(savedChat([{ source: 'telegram', chat: '7' }], 7).chat, '7');
  assert.equal(savedChat(chats, undefined), null);
});
