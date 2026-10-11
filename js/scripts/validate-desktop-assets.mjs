#!/usr/bin/env node

// js/scripts/validate-desktop-assets.mjs
//
// Check that a desktop release is complete before (and after) it is
// published (issue #37). The expected names come from the same
// catalogue the download page uses (`js/src/web/download/downloads.js`),
// so a release that passes here has a working link for every button on
// the page.
//
// Usage:
//   node js/scripts/validate-desktop-assets.mjs --tag=v1.2.3 --dist=dist
//   gh release view v1.2.3 --json assets --jq '.assets[].name' \
//     | node js/scripts/validate-desktop-assets.mjs --tag=v1.2.3 --names=-
//
// With `--dist`, every installer must also be listed in SHA256SUMS.txt.

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHECKSUM_ASSET_NAME,
  DOWNLOAD_OPTIONS,
  assetNameFor,
  expectedReleaseAssets,
  missingAssets,
  releaseVersion,
} from '../src/web/download/downloads.js';

/** Installers named in a `sha256sum` file (`<hash>  <name>` lines). */
export const checksummedNames = (text) =>
  String(text)
    .split(/\r?\n/)
    .map((line) => line.match(/^[0-9a-f]{64}\s+\*?(.+)$/i)?.[1]?.trim())
    .filter(Boolean);

/**
 * Validate a set of asset names (and optionally the checksum file).
 * @returns {{version: string, missing: string[], unchecksummed: string[]}}
 */
export const validateDesktopAssets = ({ tag, names, checksums = null }) => {
  const version = releaseVersion(tag);
  if (!version) {
    throw new Error(`cannot read a version from tag ${JSON.stringify(tag)}`);
  }
  const missing = missingAssets(expectedReleaseAssets(version), names);
  let unchecksummed = [];
  if (checksums !== null) {
    const installers = DOWNLOAD_OPTIONS.map((opt) =>
      assetNameFor(opt, version)
    );
    unchecksummed = missingAssets(installers, checksummedNames(checksums));
  }
  return { version, missing, unchecksummed };
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const parseArgs = (argv) =>
  Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [key, ...rest] = arg.slice(2).split('=');
        return [key, rest.join('=')];
      })
  );

const loadNames = async (args) => {
  if (args.dist) {
    const dir = resolve(args.dist);
    const names = await readdir(dir);
    const checksums = names.includes(CHECKSUM_ASSET_NAME)
      ? await readFile(join(dir, CHECKSUM_ASSET_NAME), 'utf8')
      : '';
    return { names, checksums };
  }
  const text =
    args.names === '-' ? await readStdin() : await readFile(args.names, 'utf8');
  return { names: text.split(/\r?\n/).filter(Boolean), checksums: null };
};

const isMain = () => {
  const invokedAs = process.argv[1] && resolve(process.argv[1]);
  return invokedAs === fileURLToPath(import.meta.url);
};

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tag || !(args.dist || args.names)) {
    console.error(
      'usage: validate-desktop-assets.mjs --tag=<tag> (--dist=<dir> | --names=<file|->)'
    );
    process.exit(2);
  }
  const { names, checksums } = await loadNames(args);
  const { version, missing, unchecksummed } = validateDesktopAssets({
    tag: args.tag,
    names,
    checksums,
  });
  for (const name of missing) {
    console.log(`::error::missing desktop release asset ${name}`);
  }
  for (const name of unchecksummed) {
    console.log(`::error::${name} is not listed in ${CHECKSUM_ASSET_NAME}`);
  }
  if (missing.length || unchecksummed.length) {
    process.exit(1);
  }
  console.log(`desktop release ${version}: all ${names.length} assets present`);
}
