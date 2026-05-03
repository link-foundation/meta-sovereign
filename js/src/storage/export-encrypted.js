/**
 * Encrypted exports (R-K13 … R-K17).
 *
 * Issue #6 requires that exported data is encrypted by default and
 * that the user is warned they are responsible for storing the file.
 *
 * The envelope shape is intentionally identical to the encrypted
 * backup format produced by `encryptBackup` so a single passphrase
 * decrypts both surfaces. The only addition is a top-level `warning`
 * field so any tool that prints the JSON shows the responsibility
 * statement first.
 */

import { promises as fs } from 'node:fs';
import { encryptBackup, decryptBackup } from './backup.js';

export const DEFAULT_WARNING =
  'Warning: this file contains your meta-sovereign data encrypted ' +
  'with the supplied passphrase. If you lose the passphrase you ' +
  'cannot recover the data. You are responsible for storing this ' +
  'file securely.';

/**
 * Build an encrypted export envelope from a Universal Links Access
 * store. Returns the JSON string that callers can write to disk or
 * stream over HTTP. Throws if the passphrase is empty.
 */
export const exportEncrypted = async (
  store,
  { passphrase, warning = DEFAULT_WARNING, now = new Date() } = {}
) => {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error(
      'exportEncrypted: a non-empty passphrase is required (R-K13)'
    );
  }
  const links = await store.query();
  const manifest = {
    createdAt: now.toISOString(),
    version: 1,
    links,
  };
  const inner = encryptBackup(JSON.stringify(manifest), passphrase);
  return JSON.stringify({
    kind: 'meta-sovereign-export',
    version: 1,
    warning,
    createdAt: now.toISOString(),
    payload: inner,
  });
};

/**
 * Decrypt an export envelope and return the manifest. Mirrors
 * `restoreBackup` but does not write to a store — call sites can pick
 * what to do with the payload.
 */
export const decryptExport = (envelopeJson, passphrase) => {
  if (typeof envelopeJson !== 'string') {
    throw new Error('decryptExport: envelope must be a string');
  }
  const env = JSON.parse(envelopeJson);
  const inner = (env.payload ?? env.ct) ? envelopeJson : null;
  // Accept both the new wrapped form ({ payload, warning, ... }) and the
  // raw `encryptBackup`/`decryptBackup` form so users can decrypt either.
  if (env.payload) {
    return JSON.parse(decryptBackup(env.payload, passphrase));
  }
  if (typeof inner === 'string') {
    return JSON.parse(decryptBackup(inner, passphrase));
  }
  throw new Error('decryptExport: envelope is not an encrypted export');
};

/**
 * Convenience: write the encrypted export to disk. Returns the file
 * path so the CLI can echo it.
 */
export const writeEncryptedExport = async (
  store,
  filePath,
  { passphrase, warning, now } = {}
) => {
  const json = await exportEncrypted(store, { passphrase, warning, now });
  await fs.writeFile(filePath, json, 'utf8');
  return filePath;
};
