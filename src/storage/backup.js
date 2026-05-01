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

const stamp = (d = new Date()) =>
  d.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace(/Z$/, '');

export const createBackup = async (store, { archiveDir, now = new Date() }) => {
  await fs.mkdir(archiveDir, { recursive: true });
  const links = await store.query();
  const manifest = {
    createdAt: now.toISOString(),
    version: 1,
    links,
  };
  const file = path.join(archiveDir, `meta-sovereign-${stamp(now)}.json`);
  await fs.writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');
  return file;
};

export const pruneBackups = async ({ archiveDir, keep }) => {
  const entries = await fs.readdir(archiveDir).catch(() => []);
  const ours = entries
    .filter((f) => f.startsWith('meta-sovereign-') && f.endsWith('.json'))
    .sort();
  const toDelete = ours.slice(0, Math.max(0, ours.length - keep));
  for (const f of toDelete) {
    await fs.unlink(path.join(archiveDir, f));
  }
  return toDelete;
};

export const restoreBackup = async (store, file) => {
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const link of manifest.links) {
    await store.put(link);
  }
  return manifest.links.length;
};
