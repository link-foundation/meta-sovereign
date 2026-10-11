/**
 * Screenshot the SPA's VK connection guide after the issue-32 rewrite.
 *
 * Starts the real server on a throwaway store, opens Connections -> VK
 * in Chromium and saves a PNG. No VK request is made.
 *
 *   node experiments/issue-32/vk-guide-screenshot.mjs [outDir] [lang]
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { startServer } from '../../js/src/server/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir =
  process.argv[2] ??
  path.resolve(here, '../../docs/case-studies/issue-32/screenshots');
const lang = process.argv[3] ?? 'en';

const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-vk-guide-'));
const server = await startServer({ storeDir, enableSync: false, log: null });
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    locale: 'en',
  });
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  // The first-run tour overlays the screen; switch it off.
  const tourOff = page.getByRole('button', { name: 'Turn off tutorial' });
  if (await tourOff.count()) {
    await tourOff.first().click();
  }
  await page.locator('[data-tutorial-id="nav:connections"]').first().click();
  await page.waitForTimeout(300);
  if (process.env.DUMP) {
    console.log(await page.locator('body').innerText());
  }
  // The VK card is the one whose heading is exactly "VK".
  const vkCard = page
    .locator('section, article, li, div')
    .filter({ has: page.getByRole('heading', { name: 'VK', exact: true }) })
    .last();
  await vkCard.getByRole('button').first().click();
  // Navigate in English (stable selectors), then switch the language.
  if (lang !== 'en') {
    await page.getByLabel('Select interface language').selectOption(lang);
  }
  await page.waitForTimeout(500);
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `vk-connection-guide-${lang}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
} finally {
  await browser.close();
  await server.close();
  await fs.rm(storeDir, { recursive: true, force: true });
}
