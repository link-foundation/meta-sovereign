// Device protection and setup use fakes in CI; no keychain is changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadLocalTls,
  localTlsPaths,
  makeLocalCertificate,
} from '../src/server/local-tls.js';
import { setupLocalCertificate } from '../src/cli/trust-commands.js';

// Models a non-exportable, per-device wrapping key; another instance
// represents another device and cannot decrypt the first one's envelope.
const device = () => {
  const key = crypto.randomBytes(32);
  return {
    async seal(value, context) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(context));
      const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
      return {
        version: 1,
        protection: 'secure-enclave',
        iv: iv.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
      };
    },
    async open(envelope, context) {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(envelope.iv, 'base64')
      );
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ]).toString();
    },
  };
};

const withStore = async (use) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-device-tls-'));
  try {
    await use(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

test('each install has a unique certificate; a legacy key can be sealed without changing trust', async () => {
  await withStore(async (dir) => {
    const legacy = await loadLocalTls(dir);
    const protector = device();
    const sealed = await loadLocalTls(dir, { protector });
    assert.equal(sealed.cert, legacy.cert);
    assert.equal(sealed.protection, 'secure-enclave');
    const paths = localTlsPaths(dir);
    const saved = await fs.readFile(paths.key, 'utf8');
    assert.ok(!saved.includes('PRIVATE KEY'));
    assert.equal((await loadLocalTls(dir, { protector })).key, legacy.key);
    assert.notEqual(makeLocalCertificate().cert, legacy.cert);
    // A cloned store cannot silently replace its device-bound key.
    await assert.rejects(loadLocalTls(dir, { protector: device() }));
    assert.equal(await fs.readFile(paths.key, 'utf8'), saved);
    assert.equal(await fs.readFile(paths.cert, 'utf8'), legacy.cert);
    // Recover a stale public certificate after a partially completed write.
    await fs.writeFile(paths.cert, makeLocalCertificate().cert);
    assert.equal((await loadLocalTls(dir, { protector })).cert, legacy.cert);
    assert.equal(await fs.readFile(paths.cert, 'utf8'), legacy.cert);
  });
});

test('an unrelated key or CA certificate is never reused as the local server identity', async () => {
  await withStore(async (dir) => {
    const original = await loadLocalTls(dir);
    const paths = localTlsPaths(dir);
    await fs.writeFile(paths.key, makeLocalCertificate().key);
    const repaired = await loadLocalTls(dir);
    assert.notEqual(repaired.cert, original.cert);
    const ca = makeLocalCertificate({ authority: true });
    await fs.writeFile(paths.key, ca.key);
    await fs.writeFile(paths.cert, ca.cert);
    const replaced = await loadLocalTls(dir);
    assert.notEqual(replaced.cert, ca.cert);
    assert.equal(new crypto.X509Certificate(replaced.cert).ca, false);
  });
});

test('serve detects existing trust, requests it once, and respects headless/explicit opt-outs', async () => {
  const calls = [];
  let isTrusted = false;
  const options = {
    platform: 'darwin',
    interactive: true,
    supported: true,
    deviceProtector: async () => {
      calls.push('hardware');
      return {};
    },
    load: async () => ({
      certPath: 'local.crt',
      protection: 'secure-enclave',
      fingerprint: 'unique',
    }),
    trusted: () => isTrusted,
    trust: async () => {
      calls.push('trust');
      isTrusted = true;
      return 0;
    },
  };
  await setupLocalCertificate({}, () => {}, options);
  await setupLocalCertificate({}, () => {}, options);
  assert.deepEqual(calls, ['hardware', 'trust', 'hardware']);
  calls.length = 0;
  isTrusted = false;
  await setupLocalCertificate(
    { trust: false, 'hardware-key': false },
    () => {},
    options
  );
  assert.deepEqual(calls, []);
  await setupLocalCertificate({}, () => {}, { ...options, interactive: false });
  assert.deepEqual(calls, ['hardware']);
  calls.length = 0;
  await setupLocalCertificate({ tls: false }, () => {}, options);
  assert.deepEqual(calls, []);
});
