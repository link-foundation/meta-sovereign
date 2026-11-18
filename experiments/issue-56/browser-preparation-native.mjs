// CI only: a real first-use download and headed launch in an isolated cache.
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import * as bc from 'browser-commander';
import { launchWithCommander } from '../../js/src/cv/browser.js';
import { prepareBrowserExecutable } from '../../js/src/browser/preparation.js';

assert.equal(
  process.env.CI,
  'true',
  'Reserve real cold-cache downloads for CI'
);
assert(process.env.PLAYWRIGHT_BROWSERS_PATH, 'Use an isolated CI cache');
const file = chromium.executablePath();
assert.equal(
  await access(file).then(
    () => true,
    () => false
  ),
  false
);
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'ms-first-browser-'));
let browser;
try {
  // The actual shared launch path must prepare the missing executable itself.
  browser = await launchWithCommander({
    bc,
    headless: false,
    profileDir,
    locale: 'en-US',
  });
  await browser.page.goto('data:text/html,<h1>Prepared browser</h1>');
  assert.equal(
    await browser.page.locator('h1').textContent(),
    'Prepared browser'
  );
  const prepared = await stat(file);
  await prepareBrowserExecutable();
  assert.equal((await stat(file)).mtimeMs, prepared.mtimeMs);
  await mkdir('artifacts/browser', { recursive: true });
  await browser.page.screenshot({
    path: 'artifacts/browser/browser-preparation.png',
  });
} finally {
  await browser?.close();
  await rm(profileDir, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    initialExecutableAbsent: true,
    preparedBySharedLaunch: true,
    headed: true,
    reused: true,
    resourcesClosed: true,
    liveProvider: false,
  })
);
