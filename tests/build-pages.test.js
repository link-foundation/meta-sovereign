/**
 * scripts/build-pages.mjs unit test — covers the GitHub Pages bundle
 * (R-L1..R-L5). Exercises the helper into a temp directory and
 * asserts every required artefact is present and well-formed.
 */

import { describe, it, expect } from 'test-anywhere';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPages } from '../scripts/build-pages.mjs';

const REQUIRED_FILES = [
  'index.html',
  '404.html',
  '.nojekyll',
  'manifest.webmanifest',
  'app.css',
  'app.min.js',
  'discover.js',
  'discovery-shell.js',
  'pattern-matcher.wasm',
];

describe('build-pages', () => {
  it('writes every required artefact into dist dir', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'meta-sov-pages-'));
    try {
      const { written } = await buildPages({
        destDir: dest,
        skipBundle: true,
      });
      for (const name of REQUIRED_FILES) {
        expect(existsSync(join(dest, name))).toBe(true);
      }
      expect(written).toContain('404.html');
      expect(written).toContain('.nojekyll');
      expect(written).toContain('manifest.webmanifest');
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it('404.html mirrors index.html so SPA deep links resolve on Pages', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'meta-sov-pages-'));
    try {
      await buildPages({ destDir: dest, skipBundle: true });
      const index = await readFile(join(dest, 'index.html'), 'utf8');
      const fallback = await readFile(join(dest, '404.html'), 'utf8');
      expect(fallback).toBe(index);
      expect(index).toMatch(/<div id="app">/);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it('injects the web app manifest link and theme-color meta', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'meta-sov-pages-'));
    try {
      await buildPages({ destDir: dest, skipBundle: true });
      const index = await readFile(join(dest, 'index.html'), 'utf8');
      expect(index).toMatch(/rel="manifest"/);
      expect(index).toMatch(/manifest\.webmanifest/);
      expect(index).toMatch(/name="theme-color"/);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it('writes a valid web app manifest', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'meta-sov-pages-'));
    try {
      await buildPages({ destDir: dest, skipBundle: true });
      const raw = await readFile(join(dest, 'manifest.webmanifest'), 'utf8');
      const manifest = JSON.parse(raw);
      expect(manifest.name).toBe('meta-sovereign');
      expect(manifest.start_url).toBe('.');
      expect(manifest.display).toBe('standalone');
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it('is idempotent — re-running does not duplicate manifest tags', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'meta-sov-pages-'));
    try {
      await buildPages({ destDir: dest, skipBundle: true });
      await buildPages({ destDir: dest, skipBundle: true });
      const index = await readFile(join(dest, 'index.html'), 'utf8');
      const matches = index.match(/manifest\.webmanifest/g) ?? [];
      expect(matches.length).toBe(1);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });
});
