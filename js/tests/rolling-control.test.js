import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  createServerControl,
  requestServerControl,
  controlAddress,
} from '../src/server/rolling-control.js';
import { writeFileDurable } from '../src/storage/durable.js';

test('control readiness waits for the initial metadata to be durable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-control-ready-'));
  let release;
  let writing;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    writing = resolve;
  });
  const creation = createServerControl({
    storeDir: dir,
    handle: { status: () => ({ pid: 123, port: 8787 }) },
    writeInfo: async (...args) => {
      writing();
      await gate;
      await writeFileDurable(...args);
    },
  });
  let control;
  try {
    await started;
    let answered = false;
    const pending = requestServerControl(dir, { operation: 'status' }).then(
      (value) => {
        answered = true;
        return value;
      }
    );
    await sleep(30);
    assert.equal(answered, false, 'a status reply must not race server.json');
    release();
    control = await creation;
    assert.equal((await pending).pid, 123);
    const info = JSON.parse(
      await readFile(path.join(dir, 'runtime/server.json'), 'utf8')
    );
    assert.equal(info.pid, 123);
    assert.equal(info.hostPid, process.pid);
  } finally {
    release();
    control ??= await creation;
    await control.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a failed startup metadata write closes its control listener', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-control-failed-'));
  try {
    await assert.rejects(
      createServerControl({
        storeDir: dir,
        handle: { status: () => ({ pid: 123 }) },
        writeInfo: async () => {
          throw new Error('fixture write failed');
        },
      }),
      /fixture write failed/
    );
    await assert.rejects(
      requestServerControl(dir, { operation: 'status' }, { timeoutMs: 1000 })
    );
    if (process.platform !== 'win32') {
      await assert.rejects(stat(controlAddress(dir)), { code: 'ENOENT' });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
