#!/usr/bin/env node

// js/scripts/normalize-desktop-artifacts.mjs
//
// electron-builder names Linux artifacts with each package format's own
// architecture spelling: AppImage says `x86_64`, deb says `amd64`
// (`aarch64` also appears for some arm64 targets), while tar.gz uses
// Node's `x64`/`arm64`. The download catalogue
// (`js/src/web/download/downloads.js`) uses `x64`/`arm64` everywhere, so
// this script renames the files and rewrites the references inside the
// electron-updater feeds (`latest*.yml`) to match. Without the second
// step auto-update would download a file name that is not on the
// release.
//
// Usage: node js/scripts/normalize-desktop-artifacts.mjs [dir]
// (default: dist/desktop/release)

import { existsSync } from 'node:fs';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const ARCH_ALIASES = [
  [/-linux-(?:x86_64|amd64)-/g, '-linux-x64-'],
  [/-linux-aarch64-/g, '-linux-arm64-'],
];

export const UPDATE_FEED_PATTERN = /^latest.*\.yml$/;

/** Canonical name for one artifact (unchanged when already canonical). */
export const normalizeArtifactName = (name) =>
  ARCH_ALIASES.reduce((acc, [from, to]) => acc.replace(from, to), name);

/** Rewrite every artifact reference inside an update feed. */
export const normalizeUpdateFeed = (text) => normalizeArtifactName(text);

export const normalizeDesktopArtifacts = async (dir) => {
  const report = { renamed: [], feeds: [] };
  if (!existsSync(dir)) {
    return report;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const target = normalizeArtifactName(entry.name);
    if (target === entry.name) {
      continue;
    }
    if (existsSync(join(dir, target))) {
      throw new Error(
        `Cannot normalize ${entry.name}: ${target} already exists`
      );
    }
    await rename(join(dir, entry.name), join(dir, target));
    report.renamed.push([entry.name, target]);
  }
  for (const name of await readdir(dir)) {
    if (!UPDATE_FEED_PATTERN.test(name)) {
      continue;
    }
    const file = join(dir, name);
    const text = await readFile(file, 'utf8');
    const normalized = normalizeUpdateFeed(text);
    if (normalized !== text) {
      await writeFile(file, normalized);
      report.feeds.push(name);
    }
  }
  return report;
};

const isMain = () => {
  const invokedAs = process.argv[1] && resolve(process.argv[1]);
  return invokedAs === fileURLToPath(import.meta.url);
};

if (isMain()) {
  const dir = resolve(
    process.argv[2] ?? join(ROOT, 'dist', 'desktop', 'release')
  );
  const { renamed, feeds } = await normalizeDesktopArtifacts(dir);
  for (const [from, to] of renamed) {
    console.log(`renamed ${from} -> ${to}`);
  }
  for (const feed of feeds) {
    console.log(`rewrote update feed ${feed}`);
  }
  if (!renamed.length && !feeds.length) {
    console.log(`nothing to normalize in ${dir}`);
  }
}
