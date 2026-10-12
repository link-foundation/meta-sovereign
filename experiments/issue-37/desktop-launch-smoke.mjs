// Launch a packaged desktop build and prove it boots (issue #37).
//
//   xvfb-run -a node experiments/issue-37/desktop-launch-smoke.mjs \
//     dist/desktop/release/linux-unpacked/meta-sovereign [screenshot.png]
//
// Starts the app with a throwaway store dir and a CDP port, attaches
// with Playwright, waits for the SPA served by the embedded local server
// (http://127.0.0.1:<random port>/) to render, and optionally saves a
// screenshot. Exits non-zero when the window never shows the app.

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const [binary, screenshot] = process.argv.slice(2);
if (!binary) {
  console.error(
    'usage: desktop-launch-smoke.mjs <app binary> [screenshot.png]'
  );
  process.exit(2);
}
const CDP_PORT = 9333;
const store = await mkdtemp(join(tmpdir(), 'meta-sov-desktop-store-'));
const app = spawn(
  resolve(binary),
  ['--no-sandbox', `--remote-debugging-port=${CDP_PORT}`],
  {
    env: { ...process.env, META_SOVEREIGN_STORE_DIR: store },
    stdio: ['ignore', 'inherit', 'inherit'],
  }
);

const connect = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('app did not open a CDP endpoint within 30s');
};

let ok = false;
try {
  const browser = await connect();
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => p.url().startsWith('http://127.0.0.1:'));
    if (!page) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!page) {
    throw new Error('no window loaded the local server');
  }
  await page.waitForFunction(
    () => document.querySelector('#root')?.children.length > 0,
    null,
    { timeout: 30000 }
  );
  const health = await page.evaluate(async () => {
    const res = await fetch('/api/health').catch(() => null);
    return res ? `${res.status}` : 'unreachable';
  });
  console.log(`window url: ${page.url()}`);
  console.log(`title: ${await page.title()}`);
  console.log(`GET /api/health: ${health}`);
  if (screenshot) {
    await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
    await page.screenshot({ path: screenshot });
    console.log(`screenshot: ${screenshot}`);
  }
  ok = true;
  await browser.close().catch(() => {});
} catch (err) {
  console.error(`FAILED: ${err.message}`);
} finally {
  app.kill('SIGTERM');
  await rm(store, { recursive: true, force: true });
}
console.log(ok ? 'DESKTOP-LAUNCH-OK' : 'DESKTOP-LAUNCH-FAILED');
process.exit(ok ? 0 : 1);
