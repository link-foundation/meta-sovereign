/**
 * Where "Export Telegram data" writes (R-Y212): a folder the server
 * chooses, `<base>/<name>`, or `<base>/<name> (1)`, `(2)`, … when it is
 * already there, so an earlier export is never mixed with a new one.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const exists = async (file) => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};

export const freeFolder = async (base, name) => {
  const first = path.join(base, name);
  let candidate = first;
  for (let n = 1; (await exists(candidate)) && n < 1000; n += 1) {
    candidate = `${first} (${n})`;
  }
  return candidate;
};
