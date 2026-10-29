import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, stat, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  let listening;
  const ready = new Promise((resolve) => {
    listening = resolve;
  });
  const deadline = setTimeout(() => child.kill('SIGTERM'), 30_000);
  ready.then(() => clearTimeout(deadline));
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
    if (/meta-sovereign listening on http:\/\/127\.0\.0\.1:\d+/.test(output)) {
      listening();
    }
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  child.once('error', (error) => {
    output += `${error.stack}\n`;
  });
  const ended = new Promise((resolve) =>
    child.once('close', (code, signal) => {
      clearTimeout(deadline);
      resolve({ code, signal, output });
    })
  );
  return {
    child,
    ended,
    waitUntilReady: () =>
      Promise.race([
        ready,
        ended.then(({ code, signal, output }) => {
          throw new Error(
            `CLI exited before readiness (code=${code}, signal=${signal}):\n${output}`
          );
        }),
      ]),
  };
};
const status = (dir) =>
  requestServerControl(dir, { operation: 'status' }, { timeoutMs: 1000 });

test('default serve owns a stable host; repeated serve reuses it and applies UI changes through a prepared worker', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-cli-rolling-'));
  const first = invoke(dir);
  // The CLI announces readiness only after staging, worker initialization and
  // control metadata persistence. Observe that event instead of guessing how
  // many filesystem operations a cold Windows runner can finish in 10 seconds.
  try {
    await first.waitUntilReady();
    const initial = await status(dir);
    const info = JSON.parse(
      await readFile(path.join(dir, 'runtime/server.json'), 'utf8')
    );
    assert.equal(info.hostPid, first.child.pid);
    if (process.platform !== 'win32') {
      assert.equal((await stat(controlAddress(dir))).mode & 0o777, 0o600);
    }
    const second = await invoke(dir).ended;
    assert.equal(second.code, 0, second.output);
    assert.match(second.output, /already running/);
    assert.equal((await status(dir)).pid, initial.pid);
    const updated = await invoke(dir, '--local-ui=true').ended;
    assert.equal(updated.code, 0, updated.output);
    assert.match(updated.output, /server upgraded/);
    const next = await status(dir);
    assert.notEqual(next.pid, initial.pid);
    assert.equal(next.port, initial.port);
    assert.equal(next.localUi, true);
    assert.equal((await fetch(`http://127.0.0.1:${next.port}/`)).status, 200);
    assert.equal(
      JSON.parse(await readFile(path.join(dir, 'runtime/server.json'), 'utf8'))
        .hostPid,
      first.child.pid
    );
    await assert.rejects(
      requestServerControl(dir, { operation: 'arbitrary-execution' }),
      /unknown/
    );
    assert.equal(
      (await fetch(`http://127.0.0.1:${next.port}/api/health`)).status,
      200
    );
  } finally {
    first.child.kill('SIGTERM');
    await first.ended;
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'CLI readiness includes startup errors instead of polling an exited child',
  { timeout: 30_000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-cli-rolling-'));
    const invalid = invoke(dir, '--port=invalid');
    try {
      await assert.rejects(
        invalid.waitUntilReady(),
        /CLI exited before readiness \(code=1, signal=.*\):[\s\S]*cannot start the server:/
      );
    } finally {
      invalid.child.kill('SIGTERM');
      await invalid.ended;
      await rm(dir, { recursive: true, force: true });
    }
  }
);

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
