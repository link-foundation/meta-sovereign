import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { startClinkServer } from '../src/storage/clink.js';
import { probeClinkFailure } from '../../experiments/issue-56/clink-failure-cleanup.mjs';

test(
  'failed real reconnect assertions close their fixture and report the original failure',
  { timeout: 15000 },
  async () => {
    const result = await probeClinkFailure({ observationMs: 10000 });
    assert.equal(result.exceededObservation, false, result.output);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /dropped one query/);
    assert.match(result.output, /clink query timed out/);
    assert.doesNotMatch(result.output, /Interrupted while running/);
    assert.match(result.output, /\[clink-client\].*query-failed/);
  }
);

test('a failed clink startup disposes its owned child', async () => {
  let killed = 0;
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    kill() {
      killed += 1;
    },
  });
  await assert.rejects(
    startClinkServer({
      bin: 'fixture',
      db: 'unused',
      spawnImpl: () => child,
      timeoutMs: 10,
    }),
    /did not start/
  );
  assert.equal(killed, 1);
});

test(
  'ordinary clink reconnects remain silent with debugging disabled',
  { timeout: 15000 },
  async () => {
    const result = await probeClinkFailure({
      observationMs: 10000,
      dropQuery: false,
      debug: '0',
    });
    assert.equal(result.exceededObservation, false, result.output);
    assert.equal(result.code, 0, result.output);
    assert.doesNotMatch(result.output, /\[clink-client\]/);
  }
);

test('close drains current and queued queries without opening another socket', async () => {
  let writes = 0;
  let connections = 0;
  let killed = 0;
  let wrote;
  const firstWrite = new Promise((resolve) => {
    wrote = resolve;
  });
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    kill() {
      killed += 1;
    },
  });
  const client = await startClinkServer({
    bin: 'fixture',
    db: 'unused',
    timeoutMs: 100,
    spawnImpl() {
      globalThis.queueMicrotask(() =>
        child.stdout.emit('data', 'listening on 127.0.0.1:1\n')
      );
      return child;
    },
    connect() {
      connections += 1;
      let destroyed = false;
      return Object.assign(new EventEmitter(), {
        setEncoding() {},
        write() {
          writes += 1;
          wrote();
        },
        destroy() {
          if (!destroyed) {
            destroyed = true;
            this.emit('close');
          }
        },
      });
    },
  });
  const pending = ['private-a', 'private-b', 'private-c'].map((text) =>
    client.query(text)
  );
  const results = Promise.allSettled(pending);
  await firstWrite;
  await client.close();
  await client.close();
  for (const result of await results) {
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, /closed/);
  }
  await assert.rejects(client.query('private-late'), /closed/);
  assert.equal(connections, 1);
  assert.equal(writes, 1);
  assert.equal(killed, 1);
});
