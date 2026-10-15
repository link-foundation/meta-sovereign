// The verbose, file-backed server log: by default the running app writes
// every entry to a file in its data folder so any issue can be root-caused
// from disk. These tests exercise the pure factory, no HTTP needed.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

import { createServerLog, installCrashLogging } from '../src/server/log.js';

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-serverlog-'));

test('createServerLog appends JSON lines to a file in the app folder', async () => {
  const storeDir = await tmpDir();
  const serverLog = await createServerLog({ storeDir, toStdout: false });
  assert.equal(
    serverLog.file,
    path.join(storeDir, 'logs', 'meta-sovereign.log')
  );
  serverLog.log({ event: 'telegram_creds_scan', found: 3 });
  // A BigInt must not break the write.
  serverLog.log({ event: 'account', id: 42n });
  await serverLog.close();

  const text = await fs.readFile(serverLog.file, 'utf8');
  const lines = text
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  // The first line records that the log opened; then our two entries.
  assert.equal(lines[0].event, 'log_opened');
  const scan = lines.find((l) => l.event === 'telegram_creds_scan');
  assert.equal(scan.found, 3);
  assert.equal(scan.level, 'info');
  assert.match(scan.ts, /^\d{4}-\d\d-\d\dT/);
  assert.equal(lines.find((l) => l.event === 'account').id, '42');
});

test('installCrashLogging records an uncaught error with its stack', () => {
  const entries = [];
  const before = process.listenerCount('uncaughtException');
  const uninstall = installCrashLogging((e) => entries.push(e));
  // Added a handler for each process event.
  assert.equal(process.listenerCount('uncaughtException'), before + 1);
  assert.equal(process.listenerCount('unhandledRejection') >= 1, true);
  // Invoke the handlers directly (not process.emit) so the test runner's
  // own listeners are not disturbed.
  process.listeners('uncaughtException').at(-1)(new Error('boom'));
  process.listeners('unhandledRejection').at(-1)(new Error('dropped'));
  uninstall();

  const uncaught = entries.find((e) => e.event === 'uncaught_exception');
  assert.equal(uncaught.level, 'error');
  assert.equal(uncaught.error, 'boom');
  assert.match(uncaught.stack, /Error: boom/);
  assert.equal(
    entries.find((e) => e.event === 'unhandled_rejection').error,
    'dropped'
  );
  // The handlers are removed again so later tests are unaffected.
  assert.equal(process.listenerCount('uncaughtException'), before);
});
