// Pin already downloaded Telegram bytes outside its evictable cache. Capturing
// history never downloads an entire archive or depends on the service later.
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs, constants } from 'node:fs';
import path from 'node:path';

const extensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
};

export const purgeVersionMedia = (dir) => async (records, store) => {
  const wanted = new Set(
    records.flatMap((record) =>
      (record.assets ?? []).map((asset) => asset.path)
    )
  );
  if (!wanted.size) {
    return;
  }
  const others = await store.query(
    (link) =>
      link.kind === 'message-version' &&
      link.assets?.some((asset) => wanted.has(asset.path))
  );
  for (const other of others) {
    other.assets.forEach((asset) => wanted.delete(asset.path));
  }
  for (const file of wanted) {
    if (/^history\/[a-f0-9]{64}\.[a-z0-9]+$/.test(file)) {
      await fs.unlink(path.join(dir, 'media', file)).catch(() => {});
    }
  }
};
const mediaKey = (link) =>
  JSON.stringify([
    link?.raw?.media?.photo?.id ?? null,
    link?.raw?.media?.document?.id ?? null,
  ]);
const pin = async (file, root, name) => {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size === 0) {
    return null;
  }
  const mimeType = (
    await fs.readFile(`${file}.type`, 'utf8').catch(() => '')
  ).trim();
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
  }
  const filename = `${hash.digest('hex')}.${extensions[mimeType] ?? 'bin'}`;
  const destination = path.join(root, filename);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if (!(await fs.stat(destination).catch(() => null))) {
    const temp = `${destination}.${process.pid}.tmp`;
    try {
      await fs.copyFile(file, temp, constants.COPYFILE_FICLONE);
      await fs.chmod(temp, 0o600);
      const handle = await fs.open(temp, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temp, destination);
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
  }
  return { name, path: `history/${filename}`, mimeType, bytes: stat.size };
};

export const preserveMessageMedia =
  (dir) =>
  async (record, { before, next, cached = true }) => {
    if (
      !cached ||
      before.source !== 'telegram' ||
      !/^-?\d+$/.test(String(before.chat))
    ) {
      return;
    }
    const id = String(before.raw?.id ?? before.id.split(':').at(-1));
    if (!/^\d+$/.test(id)) {
      return;
    }
    const cache = path.join(dir, 'media', 'telegram', String(before.chat));
    const names = (
      await fs.readdir(cache).catch((error) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        return [];
      })
    ).filter(
      (name) =>
        name.startsWith(`${id}-`) &&
        !name.endsWith('.type') &&
        !name.endsWith('.tmp')
    );
    const assets = new Map(
      (record.assets ?? []).map((asset) => [asset.name, asset])
    );
    for (const name of names) {
      const file = path.join(cache, name);
      const asset = await pin(
        file,
        path.join(dir, 'media', 'history'),
        name
      ).catch((error) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        return null;
      });
      if (asset) {
        assets.set(name, asset);
      }
    }
    if (assets.size) {
      record.assets = [...assets.values()];
    }
    return async () => {
      if (mediaKey(before) !== mediaKey(next)) {
        for (const name of names) {
          await fs.unlink(path.join(cache, name)).catch(() => {});
          await fs.unlink(path.join(cache, `${name}.type`)).catch(() => {});
        }
      }
    };
  };
