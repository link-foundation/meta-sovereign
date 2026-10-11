/**
 * DoubletsStore — UniversalLinksAccess over the binary half of the
 * associative stack (R-A3, R-G1, R-G2, issue #31).
 *
 * Records live in memory for reads; on every change the whole store is
 * written as a doublets network in the link-cli store archive layout
 * (binary links notation links packet + names packet, see
 * `doublets-archive.js`). The file opens directly in link-cli:
 *
 *   clink --db store.links --import-binary .meta-sovereign/data.bin
 *
 * Files written by the earlier `MSDB1` JSON shim are still read and are
 * migrated to the archive format on the next write.
 */

import { promises as fs } from 'node:fs';
import { createMemoryStore } from './universal.js';
import { decodeArchive, encodeArchive } from './doublets-archive.js';
import { createFileWriter } from './file-writer.js';

const LEGACY_MAGIC = Buffer.from('MSDB1\n', 'utf8');

const decodeLegacy = (buf) => {
  const len = buf.readUInt32BE(LEGACY_MAGIC.length);
  const start = LEGACY_MAGIC.length + 4;
  return JSON.parse(buf.subarray(start, start + len).toString('utf8'));
};

export const decodeStoreFile = (buf) => {
  if (buf.length === 0) {
    return [];
  }
  if (
    buf.length >= LEGACY_MAGIC.length + 4 &&
    buf.subarray(0, LEGACY_MAGIC.length).equals(LEGACY_MAGIC)
  ) {
    return decodeLegacy(buf);
  }
  return decodeArchive(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
};

export const createDoubletsStore = async (filePath) => {
  const mem = createMemoryStore();

  try {
    const buf = await fs.readFile(filePath);
    await mem.putMany(decodeStoreFile(buf));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const writer = createFileWriter(filePath, async () =>
    encodeArchive(await mem.query())
  );
  const flush = () => writer.request();

  return {
    ...mem,
    async put(link) {
      const out = await mem.put(link);
      await flush();
      return out;
    },
    async putMany(links) {
      const out = await mem.putMany(links);
      await flush();
      return out;
    },
    async delete(id) {
      const ok = await mem.delete(id);
      if (ok) {
        await flush();
      }
      return ok;
    },
    flush,
    filePath,
  };
};
