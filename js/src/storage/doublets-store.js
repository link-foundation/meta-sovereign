/**
 * DoubletsStore — UniversalLinksAccess shim for the binary doublets
 * substrate (`doublets-rs`, `doublets-web`, `link-cli`).
 *
 * The real binary backend lives in those upstream crates; this shim
 * exposes the same JS surface area today using an in-memory map plus
 * a binary-encoded sidecar on disk so the prototype already exercises
 * the dual-store invariants. Replacing the encoder with N-API bindings
 * to `doublets-rs` is a follow-up that does not require call-site
 * changes (R-A3, R-G1, R-G2).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createMemoryStore } from './universal.js';

const MAGIC = Buffer.from('MSDB1\n', 'utf8');

const encode = (links) => {
  const json = Buffer.from(JSON.stringify(links), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(json.length, 0);
  return Buffer.concat([MAGIC, len, json]);
};

const decode = (buf) => {
  if (
    buf.length < MAGIC.length + 4 ||
    !buf.slice(0, MAGIC.length).equals(MAGIC)
  ) {
    return [];
  }
  const len = buf.readUInt32BE(MAGIC.length);
  const start = MAGIC.length + 4;
  return JSON.parse(buf.slice(start, start + len).toString('utf8'));
};

export const createDoubletsStore = async (filePath) => {
  const mem = createMemoryStore();

  try {
    const buf = await fs.readFile(filePath);
    for (const link of decode(buf)) {
      await mem.put(link);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const flush = async () => {
    const links = await mem.query();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, encode(links));
  };

  return {
    ...mem,
    async put(link) {
      const out = await mem.put(link);
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
