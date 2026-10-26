// Hardware protection for the TLS key at rest. The Secure Enclave wrapping
// key cannot be restored on another device; the TLS key is used in memory
// by Node. This is not hardware-backed TLS signing or protection from a
// process already running as the same user on the original, unlocked Mac.
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePrivateDir } from '../storage/durable.js';

const SOURCE = fileURLToPath(
  new URL('./local-key-enclave.swift', import.meta.url)
);
const failure = (message) =>
  Object.assign(new Error(message), { code: 'DEVICE_KEY_UNAVAILABLE' });

/** Compile our small CryptoKit helper locally, once per source revision. */
const helper = async (storeDir, run) => {
  const source = await fs.readFile(SOURCE);
  const digest = crypto
    .createHash('sha256')
    .update(source)
    .digest('hex')
    .slice(0, 20);
  const dir = path.resolve(storeDir, 'tls', 'native');
  await ensurePrivateDir(dir);
  const executable = path.join(dir, `local-key-${digest}`);
  try {
    await fs.access(executable, fs.constants.X_OK);
    return executable;
  } catch {
    // Build outside the target path so interrupted compiles are never reused.
  }
  const temp = `${executable}.${process.pid}.tmp`;
  const built = run('xcrun', ['swiftc', '-O', SOURCE, '-o', temp], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (built.status !== 0) {
    await fs.rm(temp, { force: true });
    throw failure(
      'Secure Enclave helper could not be built. Install the macOS Command Line Tools, or explicitly use --hardware-key=false.'
    );
  }
  await fs.chmod(temp, 0o700);
  await fs.rename(temp, executable);
  return executable;
};

/** A protector for this Mac, or null on platforms without this provider. */
export const createDeviceKeyProtector = async (
  storeDir,
  { platform = process.platform, run = spawnSync } = {}
) => {
  if (platform !== 'darwin') {
    return null;
  }
  const executable = await helper(storeDir, run);
  const invoke = (mode, data) => {
    const result = run(executable, [mode], {
      input: JSON.stringify(data ?? {}),
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 64 * 1024,
    });
    if (result.status !== 0) {
      throw failure(
        'The TLS key cannot be unlocked by this Mac. Unlock the original device; copied keys cannot be used on another computer.'
      );
    }
    return JSON.parse(result.stdout);
  };
  invoke('check');
  return {
    seal: async (key, context) => invoke('seal', { key, context }),
    open: async (envelope, context) =>
      invoke('open', { envelope, context }).key,
  };
};

export const certificateFingerprint = (cert) =>
  new crypto.X509Certificate(cert).fingerprint256;

export const isDeviceKey = (key) =>
  String(key ?? '')
    .trim()
    .startsWith('{');

/** Refuse a damaged envelope; never treat an encrypted key as a new install. */
export const unlockLocalKey = async (encoded, cert, protector) => {
  const envelope = JSON.parse(encoded);
  if (
    !protector ||
    envelope.version !== 1 ||
    envelope.protection !== 'secure-enclave'
  ) {
    throw failure(
      'This TLS key requires the Secure Enclave on its original Mac.'
    );
  }
  return protector.open(envelope, certificateFingerprint(cert));
};
