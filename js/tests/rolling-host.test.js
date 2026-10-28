import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { startRollingServer } from '../src/server/rolling-host.js';
import { canShareTlsPort } from '../src/server/local-tls.js';
import { connect } from 'node:http2';

const entry = fileURLToPath(
  new URL('../bin/server-worker.js', import.meta.url)
);
const options = {
  tls: false,
  telegramAccount: false,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  emailPoll: false,
  backups: { intervalHours: 0 },
};

test('a rolling upgrade serves during warm-up and preserves every acknowledged write; bad replacements leave the old version active', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-rolling-'));
  const logs = [];
  let host;
  try {
    host = await startRollingServer({
      port: 0,
      storeDir: dir,
      options,
      release: { entry, build: 'old' },
      standbyMs: 1000,
      log: (event) => {
        logs.push(event);
        if (process.env.MS_ROLLING_DEBUG) {
          console.log(JSON.stringify(event));
        }
      },
    });
    const base = `http://127.0.0.1:${host.port}`;
    const write = async (id) => {
      const response = await fetch(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, body: id }),
      });
      assert.equal(response.status, 200, `write ${id} succeeds`);
    };
    const read = async (id) => {
      const response = await fetch(`${base}/links/${id}`);
      assert.equal(response.status, 200, `read ${id} succeeds`);
      return response.json();
    };
    await write('before');
    assert.equal(
      (
        await fetch(`${base}/api/passcode/set`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passcode: 'fixture-passcode' }),
        })
      ).status,
      200
    );
    const oldPid = host.status().pid;
    const upgrading = host.upgrade({ entry, build: 'new' });
    for (let count = 0; count < 15; count += 1) {
      await write(`during-${count}`);
      const health = await fetch(`${base}/api/health`);
      assert.equal(health.status, 200, 'public listener remains available');
      await sleep(10);
    }
    await upgrading;
    assert.notEqual(host.status().pid, oldPid);
    assert.equal(host.status().build, 'new');
    for (let count = 0; count < 15; count += 1) {
      assert.equal((await read(`during-${count}`)).body, `during-${count}`);
    }
    assert.equal((await read('before')).body, 'before');
    const failingHandoff = path.join(dir, 'failing-handoff.mjs');
    const original = await readFile(entry, 'utf8');
    const library = new URL('../src/server/rolling-worker.js', import.meta.url)
      .href;
    await writeFile(
      failingHandoff,
      original
        .replace("'../src/server/rolling-worker.js'", JSON.stringify(library))
        .replace(
          'const result = await worker[operation](body);',
          'if (operation === "activate") { throw new Error("fixture handoff failure"); }\nconst result = await worker[operation](body);'
        )
    );
    await assert.rejects(
      host.upgrade({ entry: failingHandoff, build: 'failed-handoff' })
    );
    assert.equal(
      host.status().build,
      'new',
      'failed activation rolls back to the previous code'
    );
    await write('after-rollback');
    assert.equal((await read('after-rollback')).body, 'after-rollback');
    const broken = path.join(dir, 'broken-worker.mjs');
    await writeFile(broken, 'throw new Error("fixture preparation failed");\n');
    await assert.rejects(host.upgrade({ entry: broken, build: 'broken' }));
    assert.equal(host.status().build, 'new');
    await write('after-failed-upgrade');
    assert.equal(
      (await read('after-failed-upgrade')).body,
      'after-failed-upgrade'
    );
    const forbidden = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://untrusted.example' },
    });
    assert.equal(forbidden.status, 403);
    assert.ok(logs.some((event) => event.event === 'server_upgrade_ready'));
  } finally {
    await host?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'the trusted TLS listener and HTTP/2 connection survive application worker upgrades',
  { skip: !canShareTlsPort() },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-rolling-tls-'));
    let host, client;
    try {
      host = await startRollingServer({
        port: 0,
        storeDir: dir,
        options: { ...options, tls: true },
        release: { entry, build: 'one' },
      });
      const ca = await readFile(host.tls.certPath);
      client = connect(`https://127.0.0.1:${host.port}`, { ca });
      let connects = 0;
      client.on('connect', () => (connects += 1));
      const query = () =>
        new Promise((resolve, reject) => {
          const stream = client.request({
            ':path': '/api/health',
            origin: 'https://link-foundation.github.io',
          });
          let status;
          stream.on('response', (headers) => (status = headers[':status']));
          stream.resume();
          stream.on('end', () => resolve(status));
          stream.on('error', reject);
          stream.end();
        });
      assert.equal(await query(), 200);
      const fingerprint = client.socket.getPeerCertificate().fingerprint256;
      const upgrading = host.upgrade({ entry, build: 'two' });
      for (let i = 0; i < 10; i += 1) {
        assert.equal(await query(), 200);
        await sleep(10);
      }
      await upgrading;
      assert.equal(await query(), 200);
      assert.equal(
        connects,
        1,
        'the browser-facing connection never reconnects'
      );
      assert.equal(
        client.socket.getPeerCertificate().fingerprint256,
        fingerprint
      );
    } finally {
      client?.destroy();
      await host?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('a crashed replacement recovers through the cached previous worker and replays its acknowledged writes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-rolling-crash-'));
  let host;
  try {
    host = await startRollingServer({
      port: 0,
      storeDir: dir,
      options,
      release: { entry, build: 'stable' },
    });
    const original = host.status().pid;
    await host.upgrade({ entry, build: 'replacement' });
    const base = `http://127.0.0.1:${host.port}`;
    assert.equal(
      (
        await fetch(`${base}/links`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 'survives-crash', body: 'fixture' }),
        })
      ).status,
      200
    );
    // /links acknowledges a logged write. This kills only this test's worker.
    process.kill(host.status().pid, 'SIGKILL');
    const recovered = await fetch(`${base}/links/survives-crash`);
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).body, 'fixture');
    assert.equal(host.status().pid, original);
    assert.equal(host.status().build, 'stable');
  } finally {
    await host?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
