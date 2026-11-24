import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createServerControl,
  requestServerControl,
} from '../src/server/rolling-control.js';
import { statusWhenReady } from './helpers/rolling-cli-readiness.mjs';

test('startup readiness retries a timed-out status while durable metadata is pending', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-cli-ready-'));
  let release;
  let entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const writing = new Promise((resolve) => {
    entered = resolve;
  });
  const creation = createServerControl({
    storeDir: dir,
    handle: { status: () => ({ pid: 123, port: 8787 }) },
    writeInfo: async () => {
      entered();
      await gate;
    },
  });
  let reads = 0;
  let timeouts = 0;
  try {
    await writing;
    const ready = await statusWhenReady(dir, {
      request: async (store, command) => {
        reads++;
        try {
          return await requestServerControl(store, command, {
            timeoutMs: reads === 1 ? 20 : 1000,
          });
        } catch (error) {
          assert.equal(error.code, 'HOST_TIMEOUT');
          timeouts++;
          release();
          throw error;
        }
      },
    });
    assert.equal(ready.pid, 123);
    assert.ok(timeouts >= 1);
    assert.equal(reads, timeouts + 1);
  } finally {
    release();
    await (await creation).close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('startup status timeouts consume the existing finite budget and retain their cause', async () => {
  let time = 0;
  let reads = 0;
  const last = Object.assign(new Error('still preparing'), {
    code: 'HOST_TIMEOUT',
  });
  await assert.rejects(
    statusWhenReady('unused', {
      now: () => time,
      pause: async (ms) => {
        time += ms;
      },
      budgetMs: 1200,
      request: async (_dir, command, options) => {
        assert.equal(command.operation, 'status');
        time += options.timeoutMs;
        reads++;
        throw last;
      },
    }),
    (error) =>
      error.message === 'CLI host did not start' && error.cause === last
  );
  assert.equal(time, 1200);
  assert.equal(reads, 2);
});

test('a definite control refusal is never retried by the startup probe', async () => {
  let reads = 0;
  const refusal = Object.assign(new Error('incompatible protocol'), {
    code: 'INVALID_PROTOCOL',
  });
  await assert.rejects(
    statusWhenReady('unused', {
      request: async () => {
        reads++;
        throw refusal;
      },
    }),
    (error) => error === refusal
  );
  assert.equal(reads, 1);
});
