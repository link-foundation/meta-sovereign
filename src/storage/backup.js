/**
 * Backup helper — snapshots a DualStore directory into a single
 * timestamped file in the configured archive folder, and applies
 * a simple keep-last-N retention policy (R-A4).
 *
 * The archive format is intentionally trivial: a JSON manifest that
 * embeds the .lino text and base64'd binary blob. A future PR will
 * swap this for tar.zst once we add zstd-codec; the call sites do not
 * change because they only use `createBackup(store, opts)`.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';

const ENC_VERSION = 1;
const KDF_N = 1 << 14;

const deriveKey = (passphrase, salt) =>
  scryptSync(passphrase, salt, 32, { N: KDF_N });

/**
 * Encrypt a backup manifest with AES-256-GCM. The output envelope
 * is JSON with base64 fields so it remains diff-friendly and trivially
 * portable — the binary path can use the same envelope when the call
 * sites move to tar.zst (R-A4 hardening).
 */
export const encryptBackup = (plaintext, passphrase) => {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    version: ENC_VERSION,
    cipher: 'aes-256-gcm',
    kdf: { name: 'scrypt', N: KDF_N, r: 8, p: 1 },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  });
};

export const decryptBackup = (envelopeJson, passphrase) => {
  const env = JSON.parse(envelopeJson);
  if (env.cipher !== 'aes-256-gcm') {
    throw new Error(`unsupported cipher ${env.cipher}`);
  }
  const key = deriveKey(passphrase, Buffer.from(env.salt, 'base64'));
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(env.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(env.ct, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

const stamp = (d = new Date()) =>
  d.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace(/Z$/, '');

export const createBackup = async (
  store,
  { archiveDir, now = new Date(), passphrase = null }
) => {
  await fs.mkdir(archiveDir, { recursive: true });
  const links = await store.query();
  const manifest = {
    createdAt: now.toISOString(),
    version: 1,
    links,
  };
  const plaintext = JSON.stringify(manifest, null, 2);
  if (passphrase) {
    const file = path.join(archiveDir, `meta-sovereign-${stamp(now)}.json.enc`);
    await fs.writeFile(file, encryptBackup(plaintext, passphrase), 'utf8');
    return file;
  }
  const file = path.join(archiveDir, `meta-sovereign-${stamp(now)}.json`);
  await fs.writeFile(file, plaintext, 'utf8');
  return file;
};

export const pruneBackups = async ({ archiveDir, keep }) => {
  const entries = await fs.readdir(archiveDir).catch(() => []);
  const ours = entries
    .filter(
      (f) =>
        f.startsWith('meta-sovereign-') &&
        (f.endsWith('.json') || f.endsWith('.json.enc'))
    )
    .sort();
  const toDelete = ours.slice(0, Math.max(0, ours.length - keep));
  for (const f of toDelete) {
    await fs.unlink(path.join(archiveDir, f));
  }
  return toDelete;
};

export const restoreBackup = async (
  store,
  file,
  { passphrase = null } = {}
) => {
  let raw = await fs.readFile(file, 'utf8');
  if (file.endsWith('.enc')) {
    if (!passphrase) {
      throw new Error('encrypted backup requires a passphrase');
    }
    raw = decryptBackup(raw, passphrase);
  }
  const manifest = JSON.parse(raw);
  for (const link of manifest.links) {
    await store.put(link);
  }
  return manifest.links.length;
};
