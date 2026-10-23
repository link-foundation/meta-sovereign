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
import { setInterval, clearInterval } from 'node:timers';
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { createMemoryStore, putAll } from './universal.js';
import { ensurePrivateDir, sweepTemp, writeFileDurable } from './durable.js';
import { enoughSpace, skippedEvent } from './disk-space.js';
import {
  CURRENT_SCHEMA,
  MIGRATIONS,
  SCHEMA_ID,
  runMigrations,
  versionOf,
} from './migrations/index.js';

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

const isSecretId = (link) =>
  typeof link?.id === 'string' && link.id.startsWith('secret:');

const BACKUP_FILE = /^meta-sovereign-.*\.json(\.enc)?$/;

/**
 * Whether the archive `file` is complete (R-Z2): a plain one parses and
 * holds a links array; an encrypted one has a whole envelope and, when the
 * passphrase is at hand, decrypts to such a manifest. Never throws.
 */
export const verifyBackup = async (file, { passphrase = null } = {}) => {
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (!file.endsWith('.enc')) {
      return Array.isArray(JSON.parse(raw)?.links);
    }
    const env = JSON.parse(raw);
    const whole = ['salt', 'iv', 'tag', 'ct'].every(
      (k) => typeof env[k] === 'string' && env[k].length > 0
    );
    if (!whole || env.cipher !== 'aes-256-gcm') {
      return false;
    }
    return passphrase
      ? Array.isArray(JSON.parse(decryptBackup(raw, passphrase))?.links)
      : true;
  } catch {
    return false;
  }
};

/**
 * Write a backup and say what it holds: `{ file, links, secrets,
 * secretsExcluded }`. The archive is written atomically (temp file, fsync,
 * rename, fsync of the folder), 0600, then read back; one that does not
 * verify is removed and the call fails. Secrets (`secret:*` links) go in
 * only when the archive is encrypted; otherwise they are left out and the
 * manifest says so (R-Z2). On a nearly full disk nothing is written and the
 * answer is `{ skipped: true, reason: 'low_disk', needed, free }` (R-Z14).
 */
export const makeBackup = async (
  store,
  {
    archiveDir,
    now = new Date(),
    passphrase = null,
    onEvent = () => {},
    measureFree,
  }
) => {
  await ensurePrivateDir(archiveDir);
  const all = await store.query();
  const links = passphrase ? all : all.filter((l) => !isSecretId(l));
  const schemaVersion = versionOf(all.find((l) => l.id === SCHEMA_ID));
  const secretsExcluded = all.length - links.length;
  const manifest = {
    createdAt: now.toISOString(),
    version: 1,
    secrets: passphrase ? 'included-encrypted' : 'excluded',
    secretsExcluded,
    // The data schema the links are in (R-Z17); a manifest without it is version 0.
    schema: { version: schemaVersion },
    links,
  };
  const plaintext = JSON.stringify(manifest, null, 2);
  // The archive is about as large as its text (a third more once encrypted
  // and base64'd); on a nearly full disk it is skipped, not half written
  // (R-Z14).
  const estimate = Math.ceil(plaintext.length * (passphrase ? 1.4 : 1));
  const space = await enoughSpace(archiveDir, estimate, measureFree);
  if (!space.ok) {
    onEvent(skippedEvent('backup_skipped', space));
    return { skipped: true, reason: 'low_disk', ...space, links: 0 };
  }
  const name = `meta-sovereign-${stamp(now)}.json${passphrase ? '.enc' : ''}`;
  const file = path.join(archiveDir, name);
  await writeFileDurable(
    file,
    passphrase ? encryptBackup(plaintext, passphrase) : plaintext
  );
  if (!(await verifyBackup(file, { passphrase }))) {
    await fs.unlink(file).catch(() => {});
    throw Object.assign(new Error('the backup could not be read back'), {
      code: 'BACKUP_VERIFY_FAILED',
    });
  }
  return {
    file,
    links: links.length,
    secrets: manifest.secrets,
    secretsExcluded,
  };
};

export const createBackup = async (store, options) => {
  const made = await makeBackup(store, options);
  if (made.skipped) {
    throw Object.assign(new Error('not enough free disk space for a backup'), {
      code: 'LOW_DISK',
    });
  }
  return made.file;
};

/**
 * Keep the newest `keep` archives. Nothing is deleted unless the newest
 * archive verifies as complete (a crash or a full disk may have left a
 * truncated one that must not cost the older good ones), and leftover
 * temp files of a crashed write are swept (R-Z2).
 */
export const pruneBackups = async ({ archiveDir, keep, passphrase = null }) => {
  await sweepTemp(archiveDir);
  const entries = await fs.readdir(archiveDir).catch(() => []);
  const ours = entries.filter((f) => BACKUP_FILE.test(f)).sort();
  const toDelete = ours.slice(0, Math.max(0, ours.length - keep));
  if (keep < 1 || toDelete.length === 0) {
    return [];
  }
  const newest = path.join(archiveDir, ours[ours.length - 1]);
  if (!(await verifyBackup(newest, { passphrase }))) {
    return [];
  }
  for (const f of toDelete) {
    await fs.unlink(path.join(archiveDir, f));
  }
  return toDelete;
};

/**
 * Periodic backup scheduler (R-A4).
 *
 * Wraps `createBackup` + `pruneBackups` in a `setInterval` so a long-
 * lived process (`meta-sovereign serve`) can drop a snapshot every
 * `intervalMs` and keep at most `keep` archives. Returns `{ stop }`.
 *
 * Call sites that want a one-off snapshot still use `createBackup`
 * directly; this is purely for the long-running case.
 */
export const createBackupScheduler = ({
  store,
  archiveDir,
  intervalMs,
  keep = 0,
  passphrase = null,
  onBackup = () => {},
  onError = () => {},
}) => {
  if (!archiveDir || !intervalMs) {
    throw new Error(
      'createBackupScheduler: archiveDir and intervalMs required'
    );
  }
  const tick = async () => {
    try {
      const file = await createBackup(store, { archiveDir, passphrase });
      if (keep > 0) {
        await pruneBackups({ archiveDir, keep, passphrase });
      }
      onBackup(file);
    } catch (err) {
      onError(err);
    }
  };
  const handle = setInterval(tick, intervalMs);
  if (typeof handle.unref === 'function') {
    handle.unref();
  }
  return {
    runNow: tick,
    stop: () => clearInterval(handle),
  };
};

/**
 * The links of a backup in the current shapes (R-Z17). A backup of an older
 * schema is migrated in memory, before anything is written to the store, so
 * a failing migration leaves the store untouched; one of a newer schema is
 * refused with BACKUP_TOO_NEW. The backup's own `meta:schema` is never
 * restored (the store keeps its own).
 */
export const linksOfManifest = async (
  manifest,
  { onEvent = () => {}, migrations = MIGRATIONS, current = CURRENT_SCHEMA } = {}
) => {
  const version = Number.isInteger(manifest?.schema?.version)
    ? manifest.schema.version
    : 0;
  if (version > current) {
    throw Object.assign(
      new Error(
        `this backup was written by a newer version (schema ${version}, this app understands up to ${current}); update the app`
      ),
      { code: 'BACKUP_TOO_NEW', found: version, current }
    );
  }
  const links = manifest.links.filter((l) => l.id !== SCHEMA_ID);
  if (version === current) {
    return links;
  }
  const scratch = createMemoryStore();
  await scratch.putMany(links);
  onEvent({
    level: 'info',
    event: 'migration_started',
    from: version,
    to: current,
  });
  const summary = await runMigrations(scratch, {
    migrations,
    from: version,
    onEvent,
  });
  onEvent({
    level: 'info',
    event: 'migration_done',
    from: version,
    to: summary.to,
    changed: summary.changed,
  });
  return (await scratch.query()).filter((l) => l.id !== SCHEMA_ID);
};

export const restoreBackup = async (
  store,
  file,
  { passphrase = null, onEvent = () => {} } = {}
) => {
  let raw = await fs.readFile(file, 'utf8');
  if (file.endsWith('.enc')) {
    if (!passphrase) {
      throw new Error('encrypted backup requires a passphrase');
    }
    raw = decryptBackup(raw, passphrase);
  }
  const manifest = JSON.parse(raw);
  // Checked whole before anything is written: no half restore (R-Z2).
  const valid =
    Array.isArray(manifest?.links) &&
    manifest.links.every((l) => l && typeof l === 'object' && l.id);
  if (!valid) {
    throw Object.assign(new Error('not a valid backup: links are malformed'), {
      code: 'BACKUP_INVALID',
    });
  }
  return putAll(store, await linksOfManifest(manifest, { onEvent }));
};
