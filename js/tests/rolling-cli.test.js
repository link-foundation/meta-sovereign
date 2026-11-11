import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, stat, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusWhenReady } from './helpers/rolling-cli-readiness.mjs';
import {
  controlAddress,
  requestServerControl,
} from '../src/server/rolling-control.js';
import {
  stageServerRelease,
  verifyRelease,
} from '../src/server/rolling-release.js';
import { workerArgs } from '../src/server/worker-client.js';

const cli = fileURLToPath(new URL('../bin/meta-sovereign.js', import.meta.url));
const invoke = (dir, ...extra) => {
  const child = spawn(
    process.execPath,
    [
      ...workerArgs(cli),
      'serve',
      `--store=${dir}`,
      '--port=0',
      '--tls=false',
      '--trust=false',
      '--open=false',
      '--quiet-logs',
      ...extra,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  const ended = new Promise((resolve) =>
    child.once('close', (code) => resolve({ code, output }))
  );
  return { child, ended, output: () => output };
};
test('default serve owns a stable host; repeated serve reuses it and applies UI changes through a prepared worker', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-cli-rolling-'));
  const first = invoke(dir);
  let phase = 'initial host readiness';
  try {
    const initial = await statusWhenReady(dir);
    if (process.env.MS_LIFECYCLE_DEBUG === '1') {
      console.error(
        `[rolling-cli] initial host ready\n${first.output().slice(-8192)}`
      );
    }
    const info = JSON.parse(
      await readFile(path.join(dir, 'runtime/server.json'), 'utf8')
    );
    assert.equal(info.hostPid, first.child.pid);
    if (process.platform !== 'win32') {
      assert.equal((await stat(controlAddress(dir))).mode & 0o777, 0o600);
    }
    phase = 'repeated serve';
    const second = await invoke(dir).ended;
    assert.equal(second.code, 0, second.output);
    assert.match(second.output, /already running/);
    assert.equal((await statusWhenReady(dir)).pid, initial.pid);
    phase = 'prepared UI upgrade';
    const updated = await invoke(dir, '--local-ui=true').ended;
    assert.equal(updated.code, 0, updated.output);
    assert.match(updated.output, /server upgraded/);
    const next = await statusWhenReady(dir);
    assert.notEqual(next.pid, initial.pid);
    assert.equal(next.port, initial.port);
    assert.equal(next.localUi, true);
    assert.equal((await fetch(`http://127.0.0.1:${next.port}/`)).status, 200);
    assert.equal(
      JSON.parse(await readFile(path.join(dir, 'runtime/server.json'), 'utf8'))
        .hostPid,
      first.child.pid
    );
    phase = 'control rejection and public listener';
    await assert.rejects(
      requestServerControl(dir, { operation: 'arbitrary-execution' }),
      /unknown/
    );
    assert.equal(
      (await fetch(`http://127.0.0.1:${next.port}/api/health`)).status,
      200
    );
  } catch (error) {
    // Report at file completion: the spec reporter otherwise delays the
    // assertion stack until suite completion, which a job deadline can cut off.
    console.error(`[rolling-cli] ${phase}: ${error.stack}`);
    console.error(first.output().slice(-8192));
    throw error;
  } finally {
    first.child.kill('SIGTERM');
    await first.ended;
    await rm(dir, { recursive: true, force: true });
  }
});

test('prepared release snapshots reject changed worker code', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-release-'));
  try {
    const release = await stageServerRelease({ storeDir: dir });
    assert.deepEqual(await stageServerRelease({ storeDir: dir }), release);
    await appendFile(release.entry, '\n// tampered fixture\n');
    await assert.rejects(verifyRelease(dir, release), /changed/);
    await assert.rejects(
      verifyRelease(dir, { ...release, entry: cli }),
      /entry/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
