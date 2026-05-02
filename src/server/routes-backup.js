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
import {
  createBackup,
  restoreBackup,
  pruneBackups,
} from '../storage/backup.js';

const listFiles = async (archiveDir) => {
  const entries = await fs.readdir(archiveDir).catch(() => []);
  const ours = entries
    .filter(
      (f) =>
        f.startsWith('meta-sovereign-') &&
        (f.endsWith('.json') || f.endsWith('.json.enc'))
    )
    .sort();
  const out = [];
  for (const f of ours) {
    const stat = await fs.stat(path.join(archiveDir, f)).catch(() => null);
    if (stat) {
      out.push({
        file: f,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        encrypted: f.endsWith('.enc'),
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

const handleCreate = async (store, req, res, archiveDir) => {
  const body = await readBody(req).catch(() => ({}));
  const file = await createBackup(store, {
    archiveDir,
    passphrase: body.passphrase ?? null,
  });
  if (typeof body.keep === 'number' && body.keep > 0) {
    await pruneBackups({ archiveDir, keep: body.keep });
  }
  json(res, 200, { file: path.basename(file) });
  return true;
};

const handleRestore = async (store, req, res, archiveDir) => {
  const body = await readBody(req).catch(() => ({}));
  const target = body.file ? safeUnder(archiveDir, body.file) : null;
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
  const restored = await restoreBackup(store, target, {
    passphrase: body.passphrase ?? null,
  });
  json(res, 200, { restored, file: body.file });
  return true;
};

export const handleBackupRoutes = async (store, req, res, p, archiveDir) => {
  if (!archiveDir) {
    return false;
  }
  if (p === '/api/backups' && req.method === 'GET') {
    return handleList(res, archiveDir);
  }
  if (p === '/api/backups' && req.method === 'POST') {
    return handleCreate(store, req, res, archiveDir);
  }
  if (p === '/api/backups/restore' && req.method === 'POST') {
    return handleRestore(store, req, res, archiveDir);
  }
  return false;
};
