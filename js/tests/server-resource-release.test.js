import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setImmediate as turn } from 'node:timers/promises';
import { startServer } from '../src/server/index.js';
import { acquireStoreLock } from '../src/storage/store-lock.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createRuntimeLifecycle } from '../src/server/runtime-lifecycle.js';

const options = {
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  automations: { scheduler: false },
};

test(
  'normal and handoff shutdown await every service before flushing',
  { timeout: 5000 },
  async () => {
    for (const handoff of [false, true]) {
      const gates = Array.from({ length: 5 }, () => Promise.withResolvers());
      const stopped = gates.map((gate) => () => gate.promise);
      const events = [];
      const lifecycle = createRuntimeLifecycle({
        server: { close: (done) => done() },
        sockets: new Set(),
        ctx: {
          replies: { close: stopped[0] },
          closeAutomations: stopped[1],
          chatIndex: { close() {} },
          stopJobs: stopped[2],
          telegramAccount: { stop: stopped[3] },
          publications: { close: stopped[4] },
        },
        flush: () => events.push('flush'),
        flushLog: () => events.push('flush'),
        releaseStore: () => events.push('release'),
      });
      const closing = lifecycle.close({ closeFront() {} }, {}, { handoff });
      for (const gate of gates) {
        await turn();
        assert.deepEqual(events, [], 'no flush before all services stop');
        gate.resolve();
      }
      await closing;
      assert.deepEqual(events, ['flush', 'release']);
    }
  }
);

test(
  'a failed listener releases its owned store and awaits reply cleanup',
  { timeout: 15_000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-start-release-'));
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    let release;
    let entered;
    const closing = new Promise((resolve) => {
      release = resolve;
    });
    const cleaning = new Promise((resolve) => {
      entered = resolve;
    });
    let settled = false;
    const starting = assert
      .rejects(
        startServer({
          ...options,
          storeDir: dir,
          port: blocker.address().port,
          replies: {
            clink: {
              close: () => {
                entered();
                return closing;
              },
            },
          },
        }),
        { code: 'EADDRINUSE' }
      )
      .finally(() => {
        settled = true;
      });
    try {
      await cleaning;
      // A complete event-loop turn, rather than a delay that depends on CI load.
      await turn();
      assert.equal(settled, false, 'startup must await service cleanup');
      release();
      await starting;
      const lock = await acquireStoreLock(dir, { exclusive: true });
      lock.release();
    } finally {
      release();
      await starting;
      await new Promise((resolve) => blocker.close(resolve));
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'normal close releases owned stores while injected stores retain caller ownership',
  { timeout: 15_000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-close-release-'));
    let handle;
    try {
      handle = await startServer({ ...options, storeDir: dir });
      await handle.close();
      const lock = await acquireStoreLock(dir, { exclusive: true });
      lock.release();
      let closed = 0;
      handle = await startServer({
        ...options,
        storeDir: dir,
        store: {
          ...createMemoryStore(),
          close: async () => {
            closed += 1;
          },
        },
      });
      await handle.close();
      assert.equal(closed, 0, 'only the caller may close an injected store');
    } finally {
      await handle?.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
);
