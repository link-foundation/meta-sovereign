#!/usr/bin/env node

// js/scripts/render-desktop-icon.mjs
//
// Render desktop/icon.svg to the 1024×1024 desktop/icon.png that
// electron-builder converts into the Linux, macOS (.icns) and Windows
// (.ico) icons (issue #37). Run it after editing the SVG and commit both
// files; builds only read the PNG, so they do not need a browser.
//
// Requires Playwright's Chromium (`npx playwright install chromium`).

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SIZE = 1024;

const { chromium } = await import('playwright');
const svg = await readFile(join(ROOT, 'desktop', 'icon.svg'), 'utf8');
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({
    viewport: { width: SIZE, height: SIZE },
  });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>${svg}`
  );
  await page.locator('svg').screenshot({
    path: join(ROOT, 'desktop', 'icon.png'),
    omitBackground: true,
  });
  console.log('wrote desktop/icon.png');
} finally {
  await browser.close();
}
