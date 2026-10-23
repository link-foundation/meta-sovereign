// POSIX permission bits in tests. Windows has no owner-only bits (stat
// reports 0o666 or 0o444), so only the mode assertion is skipped there (R-Z6).

import { promises as fs } from 'node:fs';
import assert from 'node:assert/strict';

export const hasModeBits = process.platform !== 'win32';

/** `file`'s permission bits are `expected` (not checked on Windows). */
export const assertMode = async (file, expected, message) => {
  if (!hasModeBits) {
    return;
  }
  assert.equal((await fs.stat(file)).mode & 0o777, expected, message);
};
