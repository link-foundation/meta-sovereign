/**
 * Copies archive files into `<store>/media/<network>/<sha256><ext>`
 * (R-Z10): owner-only, content-addressed (a second import writes
 * nothing new), streamed through a hash so large videos never sit in
 * memory. Node only; the page never loads this.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { renameDurable } from '../../storage/durable.js';
import { pipeline } from 'node:stream/promises';

const extensionOf = (name) => {
  const ext = path.extname(String(name ?? '')).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
};

/** Copy a byte stream to `<mediaDir>/<network>/<sha256><ext>` (0600). */
export const saveMedia = async ({ mediaDir, network, stream, name }) => {
  const dir = path.join(mediaDir, network);
  // Private from the first byte: media/ and media/<network>/ are 0700.
  for (const folder of [mediaDir, dir]) {
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  }
  const temp = path.join(dir, `.tmp-${randomBytes(6).toString('hex')}`);
  const hash = createHash('sha256');
  let size = 0;
  try {
    await pipeline(
      stream,
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk);
          size += chunk.length;
          yield chunk;
        }
      },
      createWriteStream(temp, { mode: 0o600 })
    );
    const sha256 = hash.digest('hex');
    const file = `${sha256}${extensionOf(name)}`;
    await renameDurable(temp, path.join(dir, file)); // (R-Z19)
    await fs.chmod(path.join(dir, file), 0o600);
    return { path: `media/${network}/${file}`, sha256, size };
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
};

/** A `save` function for createArchiveContext, writing under `mediaDir`. */
export const mediaSaver =
  (mediaDir) =>
  async ({ entry, folder }) =>
    saveMedia({
      mediaDir,
      network: folder,
      stream: await entry.stream(),
      name: entry.name,
    });
