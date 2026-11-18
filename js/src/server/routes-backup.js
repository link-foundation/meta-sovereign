/**
 * Backup HTTP surface (R-A4 + ROADMAP §4 backup→restore round-trip).
 *
 * Endpoints (gated on `archiveDir` being configured at startup so a
 * read-only browser-bound deployment cannot accidentally write to disk):
 *
 *   GET    /api/backups            -> list available archives
 *   POST   /api/backups            -> create one now (optional passphrase)
 *   POST   /api/backups/restore    -> { file, passphrase? } -> restored count
 *
 * The list endpoint returns the on-disk filenames sorted oldest-first
 * so the UI can show them as a timeline. The full path stays server-
 * side; the UI only sees basenames it must echo back to the restore
 * endpoint, and we re-resolve under `archiveDir` to prevent traversal.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { json, readBody } from './util.js';
import { safeMessage } from './redact.js';
import {
  isBackupFile,
  makeBackup,
  restoreBackup,
  pruneBackups,
} from '../storage/backup.js';
import {
  isRecoveryFile,
  recoveryFormats,
  pruneRecoveryDumps,
} from '../storage/recovery-dump.js';

const listFiles = async (archiveDir) => {
  const entries = await fs.readdir(archiveDir).catch(() => []);
  const ours = entries.filter(isBackupFile).sort();
  const out = [];
  for (const f of ours) {
    const stat = await fs.stat(path.join(archiveDir, f)).catch(() => null);
    if (stat) {
      out.push({
        file: f,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        encrypted: f.endsWith('.enc'),
        format: isRecoveryFile(f)
          ? f.endsWith('.bin')
            ? 'binary'
            : 'text'
          : 'archive',
      });
    }
  }
  return out;
};

const safeUnder = (dir, name) => {
  const resolved = path.resolve(dir, name);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
    return null;
  }
  return resolved;
};

const handleList = async (res, archiveDir) => {
  json(res, 200, await listFiles(archiveDir));
  return true;
};

// The passphrase typed on the page, else the server's own
// MS_SECRET_PASSPHRASE: with one the archive is encrypted and holds the
// secrets; without, it leaves them out and says so (R-Z2).
const handleCreate = async (
  store,
  req,
  res,
  archiveDir,
  fallback,
  recovery
) => {
  const body = await readBody(req, { allowEmpty: false });
  const passphrase = body.passphrase || fallback || null;
  let formats;
  const settings = await recovery?.get();
  const keep = body.keep ?? settings?.keep;
  try {
    formats = recoveryFormats(body.formats ?? settings?.formats);
  } catch (error) {
    json(res, 400, { ok: false, error: safeMessage(error), code: error.code });
    return true;
  }
  try {
    const made = await makeBackup(store, {
      archiveDir,
      passphrase,
      recoveryFormats: formats,
    });
    if (made.skipped) {
      // Fail closed and say why (R-Z14).
      json(res, 507, {
        ok: false,
        error: 'Not enough free disk space for a backup',
        code: 'LOW_DISK',
        needed: made.needed,
        free: made.free,
      });
      return true;
    }
    if (typeof keep === 'number' && keep > 0) {
      await pruneBackups({ archiveDir, keep, passphrase });
      await pruneRecoveryDumps({ archiveDir, keep });
    }
    json(res, 200, {
      file: path.basename(made.file),
      links: made.links,
      secrets: made.secrets,
      secretsExcluded: made.secretsExcluded,
      recovery: made.recovery.map((dump) => ({
        ...dump,
        file: path.basename(dump.file),
      })),
    });
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: safeMessage(error),
      code: error.code ?? 'BACKUP_FAILED',
    });
  }
  return true;
};

const handleRestore = async (store, req, res, archiveDir, fallback) => {
  const body = await readBody(req, { allowEmpty: false });
  const target =
    typeof body.file === 'string' && body.file
      ? safeUnder(archiveDir, body.file)
      : null;
  if (!target) {
    json(res, 400, { error: 'file is required and must be in archiveDir' });
    return true;
  }
  try {
    await fs.access(target);
  } catch {
    json(res, 404, { error: 'backup file not found' });
    return true;
  }
  try {
    const restored = await restoreBackup(store, target, {
      passphrase: body.passphrase || fallback || null,
    });
    json(res, 200, { restored, file: body.file });
  } catch (error) {
    json(res, 400, {
      ok: false,
      error: safeMessage(error),
      code: error.code ?? 'RESTORE_FAILED',
    });
  }
  return true;
};

const handleSettings = async (req, res, recovery, archiveDir) => {
  if (req.method === 'GET') {
    json(res, 200, recovery ? await recovery.get() : { available: false });
    return true;
  }
  if (req.method !== 'POST' || !archiveDir || !recovery) {
    return false;
  }
  const body = await readBody(req, { allowEmpty: false });
  try {
    json(res, 200, { ok: true, settings: await recovery.save(body) });
  } catch (error) {
    const badSetting = ['BACKUP_SETTINGS', 'BACKUP_FORMAT'].includes(
      error.code
    );
    json(res, badSetting ? 400 : 500, {
      ok: false,
      code: error.code ?? 'BACKUP_SETTINGS_FAILED',
      error: safeMessage(error),
    });
  }
  return true;
};

export const handleBackupRoutes = async (
  store,
  req,
  res,
  p,
  archiveDir,
  { fallbackPassphrase = null, recovery = null } = {}
) => {
  if (p === '/api/backups/settings') {
    return handleSettings(req, res, recovery, archiveDir);
  }
  if (!archiveDir) {
    return false;
  }
  if (p === '/api/backups' && req.method === 'GET') {
    return handleList(res, archiveDir);
  }
  if (p === '/api/backups' && req.method === 'POST') {
    return handleCreate(
      store,
      req,
      res,
      archiveDir,
      fallbackPassphrase,
      recovery
    );
  }
  if (p === '/api/backups/restore' && req.method === 'POST') {
    return handleRestore(store, req, res, archiveDir, fallbackPassphrase);
  }
  return false;
};
