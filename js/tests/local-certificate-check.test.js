import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadLocalTls, makeLocalCertificate } from '../src/server/local-tls.js';

const encode = (bytes) =>
  `-----BEGIN CERTIFICATE-----\n${bytes.toString('base64')}\n-----END CERTIFICATE-----\n`;

test('portable certificate reuse verifies the signature and matching private key', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-certificate-check-'));
  try {
    const first = await loadLocalTls(dir);
    const unchanged = await loadLocalTls(dir);
    assert.equal(unchanged.made, false);
    assert.equal(unchanged.fingerprint, first.fingerprint);
    const wrong = makeLocalCertificate();
    await fs.writeFile(path.join(dir, 'tls', 'localhost.key'), wrong.key);
    const replaced = await loadLocalTls(dir);
    assert.equal(
      replaced.made,
      true,
      'a mismatching private key cannot be reused'
    );
    assert.notEqual(replaced.fingerprint, first.fingerprint);
    const tampered = Buffer.from(
      replaced.cert.replace(/-----[^-]+-----|\s/g, ''),
      'base64'
    );
    tampered[tampered.length - 1] ^= 1;
    await fs.writeFile(
      path.join(dir, 'tls', 'localhost.crt'),
      encode(tampered)
    );
    const repaired = await loadLocalTls(dir);
    assert.equal(
      repaired.made,
      true,
      'a damaged self-signature cannot be reused'
    );
    assert.notEqual(repaired.fingerprint, replaced.fingerprint);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
