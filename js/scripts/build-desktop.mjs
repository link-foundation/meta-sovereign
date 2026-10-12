#!/usr/bin/env node

// js/scripts/build-desktop.mjs
//
// One command for local and CI desktop builds (issue #37):
//
//   1. stage the app (`prepare-desktop.mjs`, skip with --skip-prepare);
//   2. run electron-builder with `desktop/electron-builder.config.cjs`
//      (absolute paths: electron-builder resolves `--config` against
//      `--projectDir`, the staged app);
//   3. normalize Linux artifact names and update feeds
//      (`normalize-desktop-artifacts.mjs`).
//
// Every other argument goes to electron-builder, e.g.
//   npm run desktop:build -- --linux --x64
//   npm run desktop:build -- --mac --x64 --arm64 -c.mac.notarize=false
//
// electron-builder must be installed (`npm i --no-save electron-builder@^26`).
// The Electron version comes from META_SOVEREIGN_ELECTRON_VERSION, an
// installed `electron` package, or the newest release matching the
// `electron` peer range (resolved with `npm view`).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareDesktop } from './prepare-desktop.mjs';
import { normalizeDesktopArtifacts } from './normalize-desktop-artifacts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const APP_DIR = join(ROOT, 'dist', 'desktop', 'app');
const RELEASE_DIR = join(ROOT, 'dist', 'desktop', 'release');
const CONFIG = join(ROOT, 'desktop', 'electron-builder.config.cjs');

// `shell` lets Windows resolve npm.cmd/npx.cmd.
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {
    cwd: ROOT,
    shell: process.platform === 'win32',
    ...opts,
  });

/** Pick the newest version from `npm view <pkg>@<range> version --json`. */
export const newestVersion = (npmViewJson) => {
  const parsed = JSON.parse(npmViewJson);
  return Array.isArray(parsed) ? parsed.at(-1) : parsed;
};

const electronVersion = () => {
  if (process.env.META_SOVEREIGN_ELECTRON_VERSION) {
    return process.env.META_SOVEREIGN_ELECTRON_VERSION;
  }
  try {
    const pkgPath = join(ROOT, 'node_modules', 'electron', 'package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  } catch {
    const rootPkg = JSON.parse(
      readFileSync(join(ROOT, 'package.json'), 'utf8')
    );
    const range = rootPkg.peerDependencies.electron;
    return newestVersion(
      run('npm', ['view', `electron@${range}`, 'version', '--json'], {
        encoding: 'utf8',
      })
    );
  }
};

const isMain = () => {
  const invokedAs = process.argv[1] && resolve(process.argv[1]);
  return invokedAs === fileURLToPath(import.meta.url);
};

if (isMain()) {
  const argv = process.argv.slice(2);
  const builderArgs = argv.filter((arg) => arg !== '--skip-prepare');
  if (!argv.includes('--skip-prepare')) {
    await prepareDesktop({ out: APP_DIR });
  }
  const version = electronVersion();
  console.log(`electron ${version}`);
  run(
    'npx',
    [
      '--no-install',
      'electron-builder',
      '--config',
      CONFIG,
      '--projectDir',
      APP_DIR,
      ...(builderArgs.some((arg) => arg.startsWith('--publish'))
        ? []
        : ['--publish', 'never']),
      ...builderArgs,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, META_SOVEREIGN_ELECTRON_VERSION: version },
    }
  );
  const { renamed, feeds } = await normalizeDesktopArtifacts(RELEASE_DIR);
  for (const [from, to] of renamed) {
    console.log(`renamed ${from} -> ${to}`);
  }
  for (const feed of feeds) {
    console.log(`rewrote update feed ${feed}`);
  }
}
