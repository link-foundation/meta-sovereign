/**
 * LinoTextStore — UniversalLinksAccess backed by an indented `.lino`
 * file on disk. Persistence is lazy: writes batch into memory and flush
 * on `flush()` or process exit. Suitable for the prototype; can be
 * swapped for a streaming implementation once size becomes an issue.
 *
 * Requirements: R-A2, R-A3 (text half), R-A5 (indented).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createMemoryStore } from './universal.js';
import { parseLino, formatLino } from './lino.js';

const linkToNode = (link) => ({
  tokens: [link.id, ...link.tokens],
  children: (link.children ?? []).map((cid) => ({
    tokens: ['child', cid],
    children: [],
  })),
});

const nodeToLink = (node) => {
  const [id, ...tokens] = node.tokens;
  const children = node.children
    .filter((c) => c.tokens[0] === 'child')
    .map((c) => c.tokens[1]);
  return { id, tokens, children };
};

export const createLinoTextStore = async (filePath) => {
  const mem = createMemoryStore();

  let existing = '';
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  for (const node of parseLino(existing)) {
    await mem.put(nodeToLink(node));
  }

  const flush = async () => {
    const links = await mem.query();
    const text = formatLino(links.map(linkToNode));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, text, 'utf8');
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
