import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createWorkerProxy } from '../src/server/worker-proxy.js';
import {
  RECOVERY_FORMATS,
  recoveryFormats,
} from '../src/storage/recovery-formats.js';
import * as dumps from '../src/storage/recovery-dump.js';

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
const close = async (server) => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
};
const request = (port, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, headers }, (res) => {
      const chunks = [];
      res.on('error', reject);
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      );
    });
    req.on('error', reject);
  });

test('recovery format admission keeps public exports and validation semantics', () => {
  assert.equal(dumps.RECOVERY_FORMATS, RECOVERY_FORMATS);
  assert.equal(dumps.recoveryFormats, recoveryFormats);
  assert.equal(Object.isFrozen(RECOVERY_FORMATS), true);
  assert.deepEqual(recoveryFormats(), ['text', 'binary']);
  assert.deepEqual(recoveryFormats('none'), []);
  assert.deepEqual(recoveryFormats('binary,text,binary'), ['binary', 'text']);
  const given = ['binary'];
  const selected = recoveryFormats(given);
  selected.push('text');
  assert.deepEqual(given, ['binary']);
  for (const value of ['json', 'text, binary', '', null, ['binary', 'other']]) {
    assert.throws(() => recoveryFormats(value), {
      code: 'BACKUP_FORMAT',
      message: 'recovery formats must be text, binary, or text,binary',
    });
  }
});

test(
  'lazy proxy errors retain bad-host and reconnect response envelopes',
  { timeout: 5000 },
  async () => {
    let port;
    let targets = 0;
    const proxy = createWorkerProxy({
      port: () => port,
      target: async () => {
        targets++;
        throw new Error('owned fixture has no ready worker');
      },
    });
    try {
      port = await listen(proxy.server);
      const refused = await request(port, { host: 'other.invalid' });
      assert.equal(refused.status, 421);
      assert.deepEqual(JSON.parse(refused.body), {
        ok: false,
        code: 'bad-host',
        error: 'unexpected Host header',
      });
      assert.equal(targets, 0);
      const originRefused = await request(port, {
        origin: 'https://other.invalid',
      });
      assert.equal(originRefused.status, 403);
      assert.deepEqual(JSON.parse(originRefused.body), {
        ok: false,
        code: 'forbidden',
        error: 'origin is not allowed',
      });
      assert.equal(originRefused.headers.vary, 'Origin, Accept');
      assert.equal(targets, 0);
      const unavailable = await request(port);
      assert.equal(unavailable.status, 502);
      assert.deepEqual(JSON.parse(unavailable.body), {
        ok: false,
        code: 'network',
        error: 'local worker is reconnecting',
      });
      assert.equal(targets, 1);
    } finally {
      proxy.close();
      await close(proxy.server);
    }
  }
);

test(
  'healthy proxy forwarding preserves native bytes and private front identity',
  { timeout: 5000 },
  async () => {
    const body = Buffer.from([0, 255, 128, 10, 0, 24]);
    let received;
    const backend = http.createServer((req, res) => {
      received = req.headers;
      res.writeHead(207, { 'content-type': 'application/lino-binary' });
      res.end(body);
    });
    let proxy;
    try {
      const backendPort = await listen(backend);
      proxy = createWorkerProxy({
        port: () => port,
        target: async () => ({ port: backendPort, token: 'owned-front-token' }),
      });
      const port = await listen(proxy.server);
      const answer = await request(port, {
        accept: 'application/lino-binary',
        'x-meta-sovereign-front': 'untrusted-client-token',
      });
      assert.equal(answer.status, 207);
      assert.equal(answer.headers['content-type'], 'application/lino-binary');
      assert.deepEqual(answer.body, body);
      assert.equal(received['x-meta-sovereign-front'], 'owned-front-token');
      assert.equal(received['x-meta-sovereign-secure'], '0');
    } finally {
      if (proxy) {
        proxy.close();
        await close(proxy.server);
      }
      await close(backend);
    }
  }
);
