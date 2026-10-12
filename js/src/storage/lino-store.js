/**
 * LinoTextStore — UniversalLinksAccess over the text half of the
 * associative stack: a `.lino` file in Links Notation with one record per
 * line, encoded by `lino-objects-codec` so every field (bodies with new
 * lines and quotes, numbers, booleans, null, nested objects) round-trips
 * exactly and every line parses with the upstream `links-notation`
 * parser (R-A2, R-A3, R-A5, issue #31):
 *
 *   (o: (id "msg:vk:1") (tokens ("msg" "vk" "1")) (body "Привет") ...)
 *
 * Files written by the earlier indented `id token…` format (which kept
 * only id/tokens/children) are still read and are rewritten in the
 * record format on the next write.
 */

import { promises as fs } from 'node:fs';
import { decodeLine, encodeLine } from 'lino-objects-codec';
import { createMemoryStore } from './universal.js';
import { parseLino } from './lino.js';
import { createFileWriter } from './file-writer.js';

const legacyNodeToLink = (node) => {
  const [id, ...tokens] = node.tokens;
  const children = node.children
    .filter((c) => c.tokens[0] === 'child')
    .map((c) => c.tokens[1]);
  return { id, tokens, children };
};

const isRecordLine = (line) => line.startsWith('(');

/** Format links as Links Notation text, one record per line. */
export const formatLinoRecords = (links) =>
  links.map((obj) => `${encodeLine({ obj })}\n`).join('');

/** Parse `.lino` text (record lines or the legacy indented format). */
export const parseLinoRecords = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }
  if (lines.some(isRecordLine)) {
    return lines
      .filter(isRecordLine)
      .map((notation) => decodeLine({ notation }));
  }
  return parseLino(text).map(legacyNodeToLink);
};

export const createLinoTextStore = async (filePath) => {
  const mem = createMemoryStore();

  try {
    await mem.putMany(parseLinoRecords(await fs.readFile(filePath, 'utf8')));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const writer = createFileWriter(filePath, async () =>
    formatLinoRecords(await mem.query())
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
