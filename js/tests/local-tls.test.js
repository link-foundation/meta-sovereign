// HTTPS on the server's own port, for Safari (R-Y64). Only this test's
// own loopback server is asked, with its own certificate in a temporary
// store; no keychain or trust store is touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

import { startServer } from '../src/server/index.js';
import {
  canShareTlsPort,
  loadLocalTls,
  localTlsPaths,
  makeLocalCertificate,
} from '../src/server/local-tls.js';
import {
  createTrustCommands,
  trustCommandFor,
} from '../src/cli/trust-commands.js';
import { BEACON_PATH, BEACON_WIDTH, pictureSays } from '../src/web/discover.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const tempStore = () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-tls-'));

// A GET over https that trusts only `ca`.
const getSecure = (url, ca) =>
  new Promise((resolve, reject) => {
    https
      .get(url, { ca }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });

test('the certificate is for this machine only, and fit for Safari', () => {
  const now = Date.parse('2026-10-21T00:00:00Z');
  const { key, cert } = makeLocalCertificate({ now });
  const x509 = new crypto.X509Certificate(cert);
  // Read from the DER on every runtime: the names it stands for, no
  // others, and that it serves TLS (serverAuth).
  const der = Buffer.from(cert.replace(/-----[^-]+-----|\s/g, ''), 'base64');
  const has = (hex) => der.includes(Buffer.from(hex, 'hex'));
  assert.ok(has('82096c6f63616c686f7374'), 'DNS localhost');
  assert.ok(has('87047f000001'), 'IP 127.0.0.1');
  assert.ok(has('871000000000000000000000000000000001'), 'IP ::1');
  assert.ok(has('06082b06010505070301'), 'for TLS servers');
  // Deno does not have these checks yet; a TLS handshake proves them.
  if (typeof globalThis.Deno === 'undefined') {
    assert.ok(x509.verify(x509.publicKey), 'signed by its own key');
    assert.ok(x509.checkPrivateKey(crypto.createPrivateKey(key)));
    assert.equal(x509.checkHost('localhost'), 'localhost');
    assert.equal(x509.checkIP('127.0.0.1'), '127.0.0.1');
    assert.equal(x509.checkHost('example.com'), undefined);
    assert.equal(x509.ca, false, 'no authority over other sites');
  }
  const days = (Date.parse(x509.validTo) - Date.parse(x509.validFrom)) / DAY_MS;
  assert.ok(days <= 825, `Apple takes at most 825 days, got ${days}`);
});

test('the store keeps its certificate and makes a new one near its end', async () => {
  const storeDir = await tempStore();
  try {
    const now = Date.now();
    const first = await loadLocalTls(storeDir, { now });
    assert.equal(first.made, true);
    assert.equal(first.certPath, localTlsPaths(storeDir).cert);
    const keyMode = (await fs.stat(localTlsPaths(storeDir).key)).mode & 0o777;
    if (process.platform !== 'win32') {
      assert.equal(keyMode, 0o600, "the key is its owner's only");
    }
    const again = await loadLocalTls(storeDir, { now });
    assert.equal(again.made, false);
    assert.equal(again.cert, first.cert);
    const later = await loadLocalTls(storeDir, { now: now + 790 * DAY_MS });
    assert.equal(later.made, true);
    assert.notEqual(later.cert, first.cert);
  } finally {
    await fs.rm(storeDir, { recursive: true, force: true });
  }
});

test('one port answers http and https, and https has a trust page', async () => {
  const storeDir = await tempStore();
  const handle = await startServer({
    port: 0,
    storeDir,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    tls: true,
  });
  try {
    if (!canShareTlsPort()) {
      // Bun and Deno own the listening socket: plain http there.
      assert.equal(handle.tls, null);
      return;
    }
    assert.ok(handle.tls?.certPath);
    const ca = await fs.readFile(handle.tls.certPath, 'utf8');
    const plain = await fetch(`http://127.0.0.1:${handle.port}/api/status`);
    assert.equal(plain.status, 200);
    const secure = await getSecure(
      `https://127.0.0.1:${handle.port}/api/status`,
      ca
    );
    assert.equal(secure.status, 200);
    assert.equal(typeof JSON.parse(secure.body).links, 'number');
    const trusted = await getSecure(
      `https://localhost:${handle.port}/trust`,
      ca
    );
    assert.match(trusted.body, /trusts the meta-sovereign server/);
    const notYet = await (
      await fetch(`http://127.0.0.1:${handle.port}/trust`)
    ).text();
    assert.match(notYet, new RegExp(`https://127.0.0.1:${handle.port}/trust`));
    assert.match(notYet, /meta-sovereign trust/);
    // An untrusted client is refused, as Safari is before the trust.
    await assert.rejects(
      getSecure(`https://127.0.0.1:${handle.port}/api/status`, undefined)
    );
    // The picture tells the hosted page https is there.
    const svg = await (
      await fetch(`http://127.0.0.1:${handle.port}${BEACON_PATH}`)
    ).text();
    const [width, height] = svg
      .match(/width="(\d+)" height="(\d+)"/)
      .slice(1)
      .map(Number);
    assert.equal(width, BEACON_WIDTH);
    assert.deepEqual(pictureSays(height), { localUi: true, tls: true });
  } finally {
    await handle.close();
    await fs.rm(storeDir, { recursive: true, force: true });
  }
});

test('without tls the server is plain http and has no trust page', async () => {
  const storeDir = await tempStore();
  const handle = await startServer({
    port: 0,
    storeDir,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
  });
  try {
    assert.equal(handle.tls, null);
    const page = await fetch(`http://127.0.0.1:${handle.port}/trust`);
    assert.notEqual((await page.text()).includes('meta-sovereign trust'), true);
    await assert.rejects(
      fs.access(localTlsPaths(storeDir).cert),
      'no certificate is made'
    );
  } finally {
    await handle.close();
    await fs.rm(storeDir, { recursive: true, force: true });
  }
});

test('trust asks macOS through security, and only prints elsewhere', async () => {
  const storeDir = await tempStore();
  try {
    const calls = [];
    const run = (cmd, args) => {
      calls.push([cmd, args]);
      return 0;
    };
    const out = [];
    const log = (m) => out.push(m);
    const mac = createTrustCommands({
      run,
      platform: 'darwin',
      home: '/Users/me',
    });
    assert.equal(await mac.trust({ store: storeDir }, log), 0);
    const { cert } = localTlsPaths(storeDir);
    assert.deepEqual(calls, [
      trustCommandFor({ certPath: cert, home: '/Users/me' }),
    ]);
    assert.deepEqual(calls[0][1].slice(0, 5), [
      'add-trusted-cert',
      '-r',
      'trustRoot',
      '-p',
      'ssl',
    ]);
    assert.equal(calls[0][1].at(-1), cert);
    await mac.trust({ store: storeDir, remove: 'true' }, log);
    assert.deepEqual(calls[1], ['security', ['remove-trusted-cert', cert]]);

    const linux = createTrustCommands({ run, platform: 'linux' });
    out.length = 0;
    assert.equal(await linux.trust({ store: storeDir }, log), 0);
    assert.equal(calls.length, 2, 'nothing is run outside macOS');
    assert.match(out.join('\n'), new RegExp(cert.replace(/[\\.]/g, '\\$&')));

    const refused = createTrustCommands({
      run: () => 1,
      platform: 'darwin',
      home: '/Users/me',
    });
    assert.equal(await refused.trust({ store: storeDir }, log), 1);
  } finally {
    await fs.rm(storeDir, { recursive: true, force: true });
  }
});
