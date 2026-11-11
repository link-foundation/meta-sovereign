#!/usr/bin/env node
// Hosted Azure mirror stalls have consumed the Pages job before browser tests.
// Prefer the primary archive without removing the runner's mirror failover.
// Keep suites, signature keys, security sources and unrelated repositories.
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

const mirrorEntry = (line) => {
  const uri =
    /^(https?:\/\/(azure\.)?archive\.ubuntu\.com\/ubuntu\/?)(?=\s|$)/u.exec(
      line
    );
  const priority = /(?:^|\s)priority:(\d+)(?=\s|$)/u.exec(line);
  const value = Number(priority?.[1]);
  return uri && priority && Number.isSafeInteger(value)
    ? { line, azure: Boolean(uri[2]), priority: value }
    : null;
};

const preferPrimaryMirror = (before) => {
  const entries = before.split('\n').map(mirrorEntry).filter(Boolean);
  const priority = (azure) =>
    Math.min(
      ...entries
        .filter((entry) => entry.azure === azure)
        .map((entry) => entry.priority)
    );
  const azure = priority(true);
  const primary = priority(false);
  if (
    !Number.isFinite(azure) ||
    !Number.isFinite(primary) ||
    primary <= azure
  ) {
    return before;
  }
  return before
    .split('\n')
    .map((line) => {
      const entry = mirrorEntry(line);
      const old = entry?.azure ? azure : primary;
      const next = entry?.azure ? primary : azure;
      return entry?.priority === old
        ? line.replace(/(\spriority:)\d+(?=\s|$)/u, `$1${next}`)
        : line;
    })
    .join('\n');
};

export const prepareBrowserApt = async (directory = '/etc/apt') => {
  const extra = await optional(
    () => readdir(join(directory, 'sources.list.d')),
    []
  );
  const sources = [
    'sources.list',
    // Hosted Ubuntu runners route active sources through mirror+file: here.
    // Retain both archive URLs; change only their preference when recognized.
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
    const after =
      name === 'apt-mirrors.txt'
        ? preferPrimaryMirror(before)
        : before.replace(
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
