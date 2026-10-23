// R-Z14: the app survives a full disk without crashing, losing track of
// data or lying about it. No real disk is filled: a fake append handle
// throws ENOSPC for a while, free space is a stub, streams are fakes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createLinoTextStore } from '../src/storage/lino-store.js';
import { openDualStore } from '../src/storage/dual-store.js';
import { createMemoryStore } from '../src/storage/index.js';
import { createDoubletsMirror } from '../src/storage/doublets-mirror.js';
import { makeBackup, createBackup } from '../src/storage/backup.js';
import { writeFileDurable } from '../src/storage/durable.js';
import {
  LOW_DISK_BYTES,
  MARGIN_BYTES,
  diskHealth,
  enoughSpace,
  freeBytes,
} from '../src/storage/disk-space.js';
import {
  createServerLog,
  createSafeWriter,
  installCrashLogging,
} from '../src/server/log.js';
import { startServer } from '../src/server/index.js';
import {
  TELEGRAM_STATE_ID,
  createTelegramCatchUp,
  rewindPts,
} from '../src/sources/telegram-catchup.js';
import { createTelegramLive } from '../src/sources/telegram-account-live.js';
import { DiskBanner, diskNotice } from '../src/web/disk-banner.js';
import { LocaleContext } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';

const tmp = (name) => fs.mkdtemp(path.join(os.tmpdir(), `ms-z14-${name}-`));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const link = (i) => ({
  id: `msg:z14:${i}`,
  tokens: ['msg', 'z14', `${i}`],
  body: `body ${i}`,
});
const enospc = () =>
  Object.assign(new Error('ENOSPC: no space left on device'), {
    code: 'ENOSPC',
  });

// An append handle that fails with ENOSPC for the next `disk.failures`
// writes (after letting `disk.partial` bytes of the first one through).
const failingDisk = (failures, partial = 0) => {
  const disk = { failures, partial, calls: 0, reports: true };
  disk.openAppend = async (file) => {
    const real = await fs.open(file, 'a');
    return {
      write: async (...args) => {
        disk.calls += 1;
        if (disk.failures > 0) {
          disk.failures -= 1;
          if (disk.partial > 0) {
            const [buffer] = args;
            const cut = Math.min(disk.partial, buffer.length - 1);
            disk.partial = 0;
            await real.write(buffer, 0, cut);
            if (disk.reports) {
              disk.failures += 1; // the error comes on the next call
              return { bytesWritten: cut };
            }
          }
          throw enospc();
        }
        return real.write(...args);
      },
      close: () => real.close(),
    };
  };
  return disk;
};

// The test fails if any promise is rejected without a handler.
const watchRejections = () => {
  const seen = [];
  const on = (reason) => seen.push(reason);
  process.on('unhandledRejection', on);
  return {
    seen,
    stop: () => process.off('unhandledRejection', on),
  };
};

const untilTrue = async (check, what, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) {
      return;
    }
    await pause(10);
  }
  throw new Error(`timed out: ${what}`);
};

test('a full disk: puts reject with STORE_WRITE_FAILED, nothing is unhandled, and the data lands once the disk recovers', async () => {
  const rejections = watchRejections();
  const dir = await tmp('store');
  const file = path.join(dir, 'data.lino');
  const disk = failingDisk(3);
  const events = [];
  const store = await createLinoTextStore(file, {
    onEvent: (event) => events.push(event),
    queue: { openAppend: disk.openAppend, retryMs: 20, retryMaxMs: 40 },
  });
  assert.equal(store.health().degraded, false);

  await assert.rejects(store.put(link(1)), { code: 'STORE_WRITE_FAILED' });
  assert.equal(store.health().degraded, true);
  assert.ok(store.health().queuedBytes > 0, 'the line waits in memory');
  assert.equal(store.health().error, 'ENOSPC');
  // While down, further puts are refused as not confirmed, yet queued.
  await assert.rejects(store.putMany([link(2), link(3)]), {
    code: 'STORE_WRITE_FAILED',
  });
  assert.equal((await store.get('msg:z14:1')).body, 'body 1', 'memory has it');
  // flush never claims "on disk" for what is still waiting.
  await assert.rejects(store.flush(), { code: 'STORE_WRITE_FAILED' });

  await untilTrue(() => !store.health().degraded, 'degraded clears');
  assert.equal(store.health().queuedBytes, 0);
  const names = events.map((e) => e.event);
  assert.ok(names.includes('store_degraded'));
  assert.ok(names.includes('store_recovered'));
  await store.put(link(4));
  await store.flush();

  const reopened = await createLinoTextStore(file);
  assert.deepEqual(
    (await reopened.query()).map((l) => l.id).sort(),
    ['msg:z14:1', 'msg:z14:2', 'msg:z14:3', 'msg:z14:4'],
    'every put, rejected or not, is on disk'
  );
  assert.equal(reopened.corruptLines(), 0);
  await pause(20);
  rejections.stop();
  assert.deepEqual(rejections.seen, [], 'no unhandled rejection');
});

// The kernel reports how much it wrote, then fails the next call (the
// usual way), or fails without saying (then the retry finds extra bytes).
for (const reports of [true, false]) {
  test(`a write cut short by a full disk loses nothing (count reported: ${reports})`, async () => {
    const dir = await tmp('partial');
    const file = path.join(dir, 'data.lino');
    const disk = failingDisk(0, 25); // 25 bytes of the failing line get through
    disk.reports = reports;
    const store = await createLinoTextStore(file, {
      queue: { openAppend: disk.openAppend, retryMs: 10 },
    });
    await store.put(link(0)); // a line that is on disk before
    disk.failures = 1;
    await assert.rejects(store.put(link(1)), { code: 'STORE_WRITE_FAILED' });
    await untilTrue(() => !store.health().degraded, 'recovers');
    await store.flush();
    const reopened = await createLinoTextStore(file);
    // Reported: the cut line was continued, nothing is torn. Unreported:
    // the fragment is closed and set aside, the whole line follows.
    assert.equal(reopened.corruptLines(), reports ? 0 : 1);
    assert.equal((await reopened.get('msg:z14:1')).body, 'body 1');
    assert.equal((await reopened.get('msg:z14:0')).body, 'body 0');
  });
}

test('the queue is bounded: past the limit puts are refused with STORE_FULL before memory changes', async () => {
  const dir = await tmp('full');
  const disk = failingDisk(1000);
  const store = await createLinoTextStore(path.join(dir, 'data.lino'), {
    queue: { openAppend: disk.openAppend, retryMs: 60_000, maxQueueBytes: 400 },
  });
  const outcomes = [];
  for (let i = 0; i < 20; i += 1) {
    outcomes.push(
      await store.put(link(i)).then(
        () => 'ok',
        (error) => error.code
      )
    );
  }
  assert.ok(outcomes.includes('STORE_FULL'), outcomes.join());
  assert.ok(!outcomes.includes('ok'));
  const kept = (await store.query()).length;
  assert.ok(kept < 20, `refused puts never reached memory (${kept})`);
  assert.ok(store.health().queuedBytes < 400 + 200, 'memory use is bounded');
});

test('a compaction without room is skipped with a low_disk event and leaves the log alone', async () => {
  const dir = await tmp('compact');
  const file = path.join(dir, 'data.lino');
  const events = [];
  const store = await createLinoTextStore(file, {
    onEvent: (event) => events.push(event),
    measureFree: async () => 100 * 1024 * 1024, // 100 MB < size + 512 MB
  });
  for (let i = 0; i < 5; i += 1) {
    await store.put(link(1)); // superseded lines
  }
  await store.flush();
  const before = await fs.readFile(file, 'utf8');
  await store.compact();
  assert.equal(await fs.readFile(file, 'utf8'), before, 'not rewritten');
  const skipped = events.find((e) => e.event === 'compaction_skipped');
  assert.equal(skipped.reason, 'low_disk');
  assert.equal(skipped.free, 100 * 1024 * 1024);
  assert.ok(skipped.needed >= MARGIN_BYTES);
  assert.deepEqual(
    (await fs.readdir(dir)).filter((n) => n.endsWith('.tmp')),
    []
  );
  // With room it compacts.
  const roomy = await createLinoTextStore(file, {
    measureFree: async () => 10 * 1024 ** 3,
  });
  await roomy.compact();
  assert.equal((await fs.readFile(file, 'utf8')).trim().split('\n').length, 1);
});

test('a failed durable write removes its own temp file at once', async () => {
  const dir = await tmp('tmp');
  const target = path.join(dir, 'data.bin');
  await fs.mkdir(target); // the rename onto a directory fails
  await assert.rejects(writeFileDurable(target, Buffer.from('x'.repeat(100))));
  assert.deepEqual(
    (await fs.readdir(dir)).filter((n) => n.endsWith('.tmp')),
    []
  );
});

test('the snapshot is skipped, with an event, when the disk has no room', async () => {
  const events = [];
  let ran = 0;
  const mirror = await createDoubletsMirror('/nonexistent/data.bin', {
    text: { filePath: '/nonexistent/data.lino', flush: async () => {} },
    onEvent: (event) => events.push(event),
    measureFree: async () => 1024,
    snapshot: async () => {
      ran += 1;
      return { links: 1, bytes: 1 };
    },
  });
  await mirror.flush();
  assert.equal(ran, 0, 'no worker, no temp file');
  assert.equal(events[0].event, 'snapshot_skipped');
  assert.equal(events[0].reason, 'low_disk');
  assert.equal(events[0].free, 1024);
  const roomy = await createDoubletsMirror('/nonexistent/data.bin', {
    text: { filePath: '/nonexistent/data.lino', flush: async () => {} },
    measureFree: async () => 10 * 1024 ** 3,
    snapshot: async () => {
      ran += 1;
      return { links: 1, bytes: 1 };
    },
  });
  await roomy.flush();
  assert.equal(ran, 1);
});

test('a backup is skipped when the disk has no room, and says so', async () => {
  const dir = await tmp('backup');
  const store = createMemoryStore();
  await store.put(link(1));
  const events = [];
  const made = await makeBackup(store, {
    archiveDir: dir,
    onEvent: (event) => events.push(event),
    measureFree: async () => 5000,
  });
  assert.equal(made.skipped, true);
  assert.equal(made.reason, 'low_disk');
  assert.equal(events[0].event, 'backup_skipped');
  assert.deepEqual(await fs.readdir(dir), [], 'nothing written');
  await assert.rejects(
    createBackup(store, { archiveDir: dir, measureFree: async () => 5000 }),
    { code: 'LOW_DISK' }
  );
  const ok = await makeBackup(store, {
    archiveDir: dir,
    measureFree: async () => 10 * 1024 ** 3,
  });
  assert.equal(ok.links, 1);
});

test('free space: unknown allows the job; the health report flags under 1 GiB', async () => {
  assert.equal((await enoughSpace('/x', 10, async () => null)).ok, true);
  assert.equal((await enoughSpace('/x', 10, async () => 10)).ok, false);
  assert.deepEqual(await diskHealth('/x', async () => null), {
    freeBytes: null,
    low: false,
  });
  assert.equal((await diskHealth('/x', async () => 5)).low, true);
  assert.equal((await diskHealth('/x', async () => LOW_DISK_BYTES)).low, false);
  const real = await freeBytes(os.tmpdir());
  assert.ok(real === null || real > 0);
  assert.equal(typeof (await freeBytes('/definitely/not/there')), 'number');
});

test('the logger never throws: lines it cannot write are counted and summarised once writing works again', async () => {
  let broken = true;
  const lines = [];
  const emit = createSafeWriter([
    (line) => {
      if (broken) {
        throw enospc();
      }
      lines.push(line);
    },
  ]);
  emit('a\n');
  emit('b\n');
  assert.equal(emit.dropped(), 2);
  broken = false;
  emit('c\n');
  assert.equal(emit.dropped(), 0);
  const summary = JSON.parse(lines[0]);
  assert.equal(summary.event, 'log_lines_dropped');
  assert.equal(summary.count, 2);
  assert.equal(lines[1], 'c\n');

  // The real logger, with a stdout that throws (a full disk behind it).
  const storeDir = await tmp('log');
  let out = 'throw';
  const serverLog = await createServerLog({
    storeDir,
    stdout: () => {
      if (out === 'throw') {
        throw enospc();
      }
    },
  });
  serverLog.log({ event: 'one' });
  assert.ok(serverLog.dropped() >= 1);
  out = 'ok';
  serverLog.log({ event: 'two' });
  await serverLog.close();
  const text = await fs.readFile(serverLog.file, 'utf8');
  assert.match(text, /"event":"log_lines_dropped"/);
  assert.match(text, /"event":"two"/);

  // The crash handlers survive a logger that throws.
  const before = new Set(process.listeners('uncaughtException'));
  const off = installCrashLogging(() => {
    throw enospc();
  });
  const added = process
    .listeners('uncaughtException')
    .find((fn) => !before.has(fn));
  assert.doesNotThrow(() => added(new Error('boom')));
  off();
});

// A live client fake and the catch-up around it (as chat-reliability).
const manualTimers = () => {
  let next = 1;
  const due = new Map();
  return {
    setTimeout: (fn) => {
      due.set(next, fn);
      next += 1;
      return next - 1;
    },
    clearTimeout: (id) => due.delete(id),
    fire: () => {
      const all = [...due.values()];
      due.clear();
      all.forEach((fn) => fn());
    },
  };
};

const fakeApi = () => {
  const request = (name) =>
    class {
      constructor(args = {}) {
        Object.assign(this, args, { request: name });
      }
    };
  return {
    updates: {
      GetState: request('GetState'),
      GetDifference: request('GetDifference'),
    },
  };
};

const diffClient = () => {
  const client = {
    asked: [],
    invoke: async (req) => {
      client.asked.push(req);
      return {
        className: 'updates.Difference',
        newMessages: [
          {
            className: 'Message',
            id: 1,
            message: 'one',
            peerId: { userId: 5 },
          },
        ],
        otherUpdates: [],
        users: [],
        chats: [],
        state: { pts: 15, qts: 0, date: 120, seq: 3 },
      };
    },
    addEventHandler: () => {},
  };
  return client;
};

test('Telegram: the update cursor does not advance past updates whose store write failed', async () => {
  const store = createMemoryStore();
  await store.put({
    id: TELEGRAM_STATE_ID,
    account: '77',
    pts: 10,
    qts: 0,
    date: 1,
    seq: 0,
  });
  const timers = manualTimers();
  const logs = [];
  let storeUp = false;
  const stored = [];
  const catchUp = createTelegramCatchUp({
    store,
    importer: async () => ({ Api: fakeApi() }),
    // The live handler, strict: a failed store write is thrown.
    handle: async (_client, update, options) => {
      if (!storeUp) {
        assert.equal(options?.strict, true);
        throw enospc();
      }
      stored.push(update);
    },
    log: (entry) => logs.push(entry),
    timers,
  });
  const client = diffClient();
  await catchUp.attach(client, { id: 77 });
  assert.equal(catchUp.state().pts, 10, 'the old cursor is kept');
  assert.equal((await store.get(TELEGRAM_STATE_ID)).pts, 10);
  assert.ok(logs.some((l) => l.event === 'telegram_catch_up_failed'));

  // The disk is back: the retry fetches the same difference again.
  storeUp = true;
  timers.fire();
  await untilTrue(() => catchUp.state().pts === 15, 'cursor advances');
  assert.equal(client.asked.at(-1).pts, 10, 're-fetched from the old cursor');
  assert.equal(stored.length, 1);
  assert.equal((await store.get(TELEGRAM_STATE_ID)).pts, 15);
  await catchUp.stop();
});

test('Telegram: a live update that could not be stored steps the cursor back and is reported', async () => {
  const state = { pts: 20, qts: 0, date: 1, seq: 0 };
  const update = { className: 'UpdateNewMessage', pts: 20, ptsCount: 1 };
  assert.equal(rewindPts(state, update), true);
  assert.equal(state.pts, 19);
  assert.equal(rewindPts(state, update), false, 'already behind it');
  assert.equal(rewindPts(null, update), false);
  assert.equal(rewindPts(state, { className: 'UpdateTyping' }), false);

  const failing = {
    ...createMemoryStore(),
    get: async () => null,
    put: async () => {
      throw Object.assign(new Error('write failed'), {
        code: 'STORE_WRITE_FAILED',
      });
    },
  };
  const logs = [];
  const failed = [];
  const live = createTelegramLive({
    store: failing,
    toLinks: () => [],
    log: (entry) => logs.push(entry),
    onFailed: (u) => failed.push(u),
  });
  const draft = {
    className: 'UpdateDraftMessage',
    peer: { userId: 5 },
    draft: { className: 'DraftMessage', message: 'hi', date: 1 },
    pts: 21,
    ptsCount: 1,
  };
  await live.handle({}, draft);
  assert.equal(failed.length, 1, 'the cursor owner hears of it');
  assert.equal(logs[0].event, 'telegram_update_failed');
  assert.equal(logs[0].code, 'STORE_WRITE_FAILED');
  await assert.rejects(live.handle({}, draft, { strict: true }), {
    code: 'STORE_WRITE_FAILED',
  });
});

test('/api/health reports the disk and the store, and null free space is not low', async () => {
  const storeDir = await tmp('health');
  const ask = async (diskFree) => {
    const server = await startServer({
      port: 0,
      storeDir,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      log: null,
      diskFree,
    });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/health`
      );
      return await response.json();
    } finally {
      await server.close();
    }
  };
  const low = await ask(async () => 200 * 1024 * 1024);
  assert.equal(low.ok, true);
  assert.deepEqual(low.disk, { freeBytes: 200 * 1024 * 1024, low: true });
  assert.deepEqual(low.store, { degraded: false, queuedBytes: 0 });
  const unknown = await ask(async () => null);
  assert.deepEqual(unknown.disk, { freeBytes: null, low: false });
  const roomy = await ask(async () => 50 * 1024 ** 3);
  assert.equal(roomy.disk.low, false);
});

test('the dual store exposes health, and a degraded log shows in it', async () => {
  const dir = await tmp('dual');
  const store = await openDualStore(dir);
  assert.deepEqual(store.health(), {
    degraded: false,
    queuedBytes: 0,
    error: null,
  });
  await store.put(link(1));
  await store.flush();
  store.close();
});

const render = (props, locale = 'en') => {
  const t = (key) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  return renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      { value: { locale, t, setLocale: () => {}, available: [] } },
      React.createElement(DiskBanner, props)
    )
  );
};

test('the page banner shows for low disk or a degraded store, not for unknown space, in all four languages', () => {
  assert.equal(diskNotice({ disk: { freeBytes: 5, low: true } }), true);
  assert.equal(diskNotice({ store: { degraded: true } }), true);
  assert.equal(diskNotice({ disk: { freeBytes: null, low: false } }), false);
  assert.equal(diskNotice({ disk: { freeBytes: 9e9, low: false } }), false);
  assert.equal(diskNotice(null), false);

  const low = { health: { disk: { freeBytes: 5, low: true } } };
  const html = render(low);
  assert.match(html, /Disk almost full — new messages may not be saved/);
  assert.match(html, /data-action="disk-banner-dismiss"/);
  assert.equal(
    render({ health: { disk: { freeBytes: null, low: false } } }),
    ''
  );
  const seen = new Set();
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const text = dictionaries[locale]['disk.banner'];
    assert.ok(text, `${locale} has the text`);
    assert.ok(render(low, locale).includes(text));
    seen.add(text);
  }
  assert.equal(seen.size, 4, 'each language has its own words');
});
