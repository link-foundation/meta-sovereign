import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setImmediate as turn } from 'node:timers/promises';
import test from 'node:test';
import { spawnWorker } from '../src/server/worker-client.js';

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
