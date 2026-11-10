#!/usr/bin/env node
// Hosted Azure mirror stalls have consumed the Pages job before browser tests.
// Change only that mirror; keep suites, signature keys and security sources.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const optional = async (operation, fallback) => {
  try {
    return await operation();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
};

export const prepareBrowserApt = async (directory = '/etc/apt') => {
  const extra = await optional(
    () => readdir(join(directory, 'sources.list.d')),
    []
  );
  const sources = [
    'sources.list',
    // Hosted Ubuntu runners route active sources through mirror+file: here.
    // Preserve the mirror metadata and source indirection while changing URL.
    'apt-mirrors.txt',
    ...extra
      .filter((name) => /\.(?:list|sources)$/u.test(name))
      .map((name) => join('sources.list.d', name)),
  ];
  let changed = 0;
  for (const name of sources) {
    const file = join(directory, name);
    const before = await optional(() => readFile(file, 'utf8'), null);
    if (before === null) {
      continue;
    }
    const after = before.replace(
      /(^|\s)https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu(?=\/?(?:\s|$))/gu,
      '$1https://archive.ubuntu.com/ubuntu'
    );
    if (after !== before) {
      await writeFile(file, after);
      changed++;
    }
  }
  return changed;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(`Browser APT sources updated: ${await prepareBrowserApt()}`);
}
