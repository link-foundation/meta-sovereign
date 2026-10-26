#!/usr/bin/env node

// js/scripts/build-pages.mjs
//
// Pack `js/src/web/` into a static bundle ready for GitHub Pages.
//
// The published bundle is the same React SPA shipped with the
// desktop and mobile apps. The SPA boots offline-first via
// `OfflineClient` + `BrowserStore`, and uses `discoverServer()` to
// attach a local Rust or JS server when one is reachable. See
// `docs/case-studies/issue-8/solution-plan.md` (R-L1..R-L5) for the
// full requirement trace.
//
// Outputs (under `dist/pages/` by default):
//   - index.html                 — SPA entry with versioned asset paths.
//   - 404.html                   — copy of index.html so SPA deep
//                                  links resolve on GitHub Pages.
//   - .nojekyll                  — empty marker so files starting
//                                  with `_` are served verbatim.
//   - manifest.webmanifest       — minimal Web App Manifest so
//                                  Chromium browsers offer "Install".
//   - app.css, app.min.js, …     — every static asset under js/src/web/.
//   - download/                  — the desktop download landing page
//                                  (issue #37) with the app icon from
//                                  desktop/icon.svg.
//
// The script is idempotent: it deletes `dist/pages/` first, then
// recreates it. It always re-runs the production esbuild bundle so
// the deployed app.min.js matches the source app.js.

import {
  mkdir,
  readdir,
  rm,
  copyFile,
  writeFile,
  readFile,
  stat,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const JS_ROOT = resolve(HERE, '..');
const ROOT = resolve(JS_ROOT, '..');
const SRC = resolve(JS_ROOT, 'src/web');

const STATIC_FILES = [
  'index.html',
  'app.css',
  'app.js',
  'app.min.js',
  'client.js',
  'discover.js',
  'discovery-shell.js',
  'dom.js',
  'pattern-worker.js',
  'pattern-matcher.wasm',
  'patterns-wasm.js',
  'views.js',
  'webrtc-sync.js',
];

const MANIFEST = {
  name: 'meta-sovereign',
  short_name: 'meta-sovereign',
  description:
    'Personal meta profile sovereign system — fully local, privacy-respecting personal CRM and unified messenger across services.',
  start_url: '.',
  scope: '.',
  display: 'standalone',
  background_color: '#0b0d12',
  theme_color: '#0b0d12',
  icons: [],
};

const buildWebBundle = async () => {
  // Re-export from build-web.mjs would couple us to esbuild side
  // effects on import; we just shell out so the two scripts stay
  // independent and so this script can be run in CI without
  // requiring a separate `npm run build:web` step.
  const { build } = await import('esbuild');
  await build({
    entryPoints: [resolve(SRC, 'app.js')],
    outfile: resolve(SRC, 'app.min.js'),
    bundle: true,
    format: 'esm',
    minify: true,
    sourcemap: false,
    target: ['es2022'],
    external: ['doublets-web'],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'info',
  });
};

const injectManifestLink = (html) => {
  // Inject the manifest link before </head>. Idempotent: if the link
  // is already present we return the html unchanged.
  if (html.includes('manifest.webmanifest')) {
    return html;
  }
  const link =
    '    <link rel="manifest" href="./manifest.webmanifest" />\n' +
    '    <meta name="theme-color" content="#0b0d12" />\n';
  return html.replace('</head>', `${link}  </head>`);
};

// A new interface must not reuse a previous deployment's ten-minute
// browser/CDN cache. Keep canonical files too, for probes and embedders.
const versionEntryAssets = async (html, destDir, written) => {
  for (const name of ['app.min.js', 'app.css']) {
    const from = join(destDir, name);
    if (!existsSync(from)) {
      continue;
    }
    const hash = createHash('sha256')
      .update(await readFile(from))
      .digest('hex')
      .slice(0, 16);
    const versioned = name.replace('app.', `app.${hash}.`);
    await copyFile(from, join(destDir, versioned));
    written.push(versioned);
    html = html.replaceAll(`./${name}"`, `./${versioned}"`);
  }
  return html;
};

const copyAdditionalAssets = async (srcDir, destDir) => {
  // Copy any extra files at the root of js/src/web/ that we did not
  // enumerate explicitly (e.g. future fonts, images), but skip the
  // node_modules and any file already handled.
  const entries = await readdir(srcDir, { withFileTypes: true });
  const copied = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (STATIC_FILES.includes(entry.name)) {
      continue;
    }
    if (entry.name.startsWith('.')) {
      continue;
    }
    await copyFile(join(srcDir, entry.name), join(destDir, entry.name));
    copied.push(entry.name);
  }
  return copied;
};

// Sub-pages published next to the SPA. Each is a directory of
// static files under js/src/web/ (issue #37).
const PAGE_DIRS = ['download'];
const DESKTOP_ICON = resolve(ROOT, 'desktop/icon.svg');

const copyPageDirs = async (srcDir, destDir) => {
  const copied = [];
  for (const dir of PAGE_DIRS) {
    const from = join(srcDir, dir);
    if (!existsSync(from)) {
      continue;
    }
    await mkdir(join(destDir, dir), { recursive: true });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.isFile() && !entry.name.startsWith('.')) {
        await copyFile(join(from, entry.name), join(destDir, dir, entry.name));
        copied.push(`${dir}/${entry.name}`);
      }
    }
    if (existsSync(DESKTOP_ICON)) {
      await copyFile(DESKTOP_ICON, join(destDir, dir, 'icon.svg'));
      copied.push(`${dir}/icon.svg`);
    }
  }
  return copied;
};

export const buildPages = async ({
  srcDir = SRC,
  destDir = resolve(ROOT, 'dist/pages'),
  skipBundle = false,
} = {}) => {
  if (!skipBundle) {
    if (!existsSync(srcDir)) {
      throw new Error(`src dir not found: ${srcDir}`);
    }
    await buildWebBundle();
  }

  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });

  const written = [];
  for (const name of STATIC_FILES) {
    const from = join(srcDir, name);
    const to = join(destDir, name);
    if (!existsSync(from)) {
      // app.min.js is built above; the rest must exist.
      if (name === 'app.min.js') {
        continue;
      }
      throw new Error(`expected static asset missing: ${from}`);
    }
    await copyFile(from, to);
    written.push(name);
  }

  const extras = await copyAdditionalAssets(srcDir, destDir);
  written.push(...extras);
  written.push(...(await copyPageDirs(srcDir, destDir)));

  // Inject manifest link into the deployed index.html, leaving the
  // source file untouched (the local server keeps serving the
  // original index.html).
  const indexPath = join(destDir, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  await writeFile(
    indexPath,
    await versionEntryAssets(injectManifestLink(html), destDir, written),
    'utf8'
  );

  // 404.html is a verbatim copy of index.html so SPA deep links
  // resolve to the SPA shell instead of GitHub's default 404 page.
  await copyFile(indexPath, join(destDir, '404.html'));
  written.push('404.html');

  // .nojekyll marker — empty file at the artifact root.
  await writeFile(join(destDir, '.nojekyll'), '', 'utf8');
  written.push('.nojekyll');

  // Web App Manifest.
  await writeFile(
    join(destDir, 'manifest.webmanifest'),
    `${JSON.stringify(MANIFEST, null, 2)}\n`,
    'utf8'
  );
  written.push('manifest.webmanifest');

  return { destDir, written };
};

const isMain = () => {
  const invokedAs = process.argv[1] && resolve(process.argv[1]);
  return invokedAs === fileURLToPath(import.meta.url);
};

if (isMain()) {
  const { destDir, written } = await buildPages();
  const totalBytes = (
    await Promise.all(
      written.map(async (name) => (await stat(join(destDir, name))).size)
    )
  ).reduce((a, b) => a + b, 0);
  console.log(
    `Wrote ${written.length} files (${(totalBytes / 1024).toFixed(1)} KiB) to ${destDir}`
  );
  for (const name of written.sort()) {
    console.log(`  ${name}`);
  }
}
