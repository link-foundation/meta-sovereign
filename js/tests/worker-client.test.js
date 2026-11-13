import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setImmediate as turn } from 'node:timers/promises';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnWorker, workerArgs } from '../src/server/worker-client.js';

test(
  'Deno workers use installed dependencies offline despite automatic project installation',
  { timeout: 10000, skip: !process.versions.deno },
  async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-worker-offline-'));
    try {
      const name = '@meta-sovereign/worker-offline-fixture';
      const module = path.join(dir, 'node_modules', name);
      await mkdir(module, { recursive: true });
      await writeFile(
        path.join(dir, 'deno.json'),
        JSON.stringify({ nodeModulesDir: 'auto' })
      );
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ type: 'module', dependencies: { [name]: '^1.0.0' } })
      );
      await writeFile(
        path.join(module, 'package.json'),
        JSON.stringify({
          name,
          version: '1.0.0',
          type: 'module',
          main: 'index.js',
        })
      );
      await writeFile(
        path.join(module, 'index.js'),
        'export default "installed";'
      );
      const entry = path.join(dir, 'worker.js');
      await writeFile(
        entry,
        `import value from '${name}'; console.log(value);`
      );
      const args = workerArgs(entry);
      args.splice(args.length - 1, 0, '--cached-only');
      const child = spawn(process.execPath, args, {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: t.signal,
      });
      let output = '';
      let errors = '';
      child.stdout.on('data', (chunk) => (output += String(chunk)));
      child.stderr.on('data', (chunk) => (errors += String(chunk)));
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      assert.equal(code, 0, errors);
      assert.equal(output.trim(), 'installed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

const fixture = () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 56;
  child.kill = (signal) => {
    child.signal = signal;
    return true;
  };
  const requests = [];
  child.stdin.on('data', (data) => requests.push(JSON.parse(String(data))));
  const client = spawnWorker({ entry: 'fixture', spawnChild: () => child });
  const response = () => {
    const { id } = requests.at(-1);
    child.stdout.write(
      `${JSON.stringify({ type: 'response', id, result: null })}\n`
    );
  };
  const close = () => {
    child.stdin.end();
    child.stdout.end();
    child.stderr.end();
    child.emit('close', 0, null);
  };
  return { child, client, response, close, requests };
};

test(
  'worker close waits for process and stdio closure after its acknowledgment',
  { timeout: 2000 },
  async () => {
    const f = fixture();
    let settled = false;
    let notified = false;
    f.client.onExit(() => {
      notified = true;
    });
    const closing = f.client.close().then(() => {
      settled = true;
    });
    assert.equal(f.requests[0].operation, 'close');
    f.response();
    await turn();
    assert.equal(
      settled,
      false,
      'an IPC acknowledgment does not release the worker'
    );
    f.child.emit('exit', 0, null);
    await turn();
    assert.equal(f.client.exited, true);
    assert.equal(settled, false, 'the process can exit before its pipes close');
    assert.equal(notified, false, 'supervisor must keep tracking the worker');
    f.close();
    await closing;
    assert.equal(notified, true);
  }
);

test(
  'failed warm readers are discarded only after their resources close',
  { timeout: 2000 },
  async () => {
    const f = fixture();
    let settled = false;
    const discarding = Promise.resolve(f.client.discard()).then(() => {
      settled = true;
    });
    assert.equal(f.child.signal, 'SIGTERM');
    await turn();
    assert.equal(settled, false);
    f.child.emit('exit', 0, 'SIGTERM');
    const closing = f.client.close();
    f.close();
    await Promise.all([discarding, closing]);
    assert.equal(f.requests.length, 0, 'do not send IPC to an exited process');
  }
);
