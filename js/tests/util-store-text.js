// Concatenate every file a store wrote under `dir`, so a test can assert on
// what was persisted without depending on the store's exact on-disk layout.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const readStoreText = async (dir) => {
  let text = '';
  const walk = async (d) => {
    for (const entry of await fs
      .readdir(d, { withFileTypes: true })
      .catch(() => [])) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        text += await fs.readFile(full, 'utf8').catch(() => '');
      }
    }
  };
  await walk(dir);
  return text;
};
