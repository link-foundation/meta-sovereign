// One native seam assertion at one viewport. The parent seed is evaluated
// with the UTC clock from its actual failure; production CSS is untouched.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { fulfilWire } from '../../js/tests/helpers/http-wire.mjs';
import { pixelsAt } from '../../js/tests/helpers/e2e-colors.mjs';

const before = process.argv.includes('--before');
const parent = '060048e9658e7f8851f9733b376763c09fa6d37f';
const file = 'js/tests/e2e-chat-selection-browser.mjs';
const source = before
  ? execFileSync('git', ['show', `${parent}:${file}`], { encoding: 'utf8' })
  : await readFile(file, 'utf8');
const fixtureClock = Date.parse('2026-11-15T00:07:32Z');
class FixtureDate extends Date {
  static now() {
    return fixtureClock;
  }
}
// Exercise the actual fixture bytes, including its complete seeding loop.
const seed = source.slice(
  source.indexOf('const CHAT ='),
  source.indexOf('const dir =')
);
assert(seed.includes('await store.put('), 'complete fixture seed found');
const { store, CHAT, idOf } = await runInNewContext(
  `(async () => { ${seed}; return { store, CHAT, idOf }; })()`,
  { createMemoryStore, Date: FixtureDate }
);
const shots = 'docs/screenshots/issue-56-selection-clock';
await mkdir(shots, { recursive: true });
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-selection-clock-'));
let handle;
let browser;
const errors = [];
try {
  handle = await startServer({
    localUi: true,
    port: 0,
    storeDir: dir,
    store,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    log: null,
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 2200, height: 1000 },
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
    globalThis.localStorage.setItem('metaSovereignSkin', 't3');
  });
  for (const [api, body] of [
    ['status', { connected: true, kind: 'user', offline: false }],
    ['history', { written: 0, cached: true, complete: true }],
  ]) {
    await page.route(`**/api/telegram/${api}`, (route) =>
      fulfilWire(route, {
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    );
  }
  await page.goto(`http://127.0.0.1:${handle.port}/#chat=telegram:${CHAT}`);
  const row = (n) => page.locator(`[data-row="${idOf(n)}"]`);
  await row(14).waitFor();
  await row(12).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const bubble = row(12).locator(':scope > .bubble');
  const geometryBefore = await bubble.boundingBox();
  const blankX = await page.locator('.chat-scroll').evaluate((node) => {
    const box = node.getBoundingClientRect();
    const column = node.querySelector('.chat-column').getBoundingClientRect();
    return (column.right + box.left + node.clientLeft + node.clientWidth) / 2;
  });
  await page.mouse.click(blankX, geometryBefore.y + geometryBefore.height / 2);
  await row(12).locator('.bubble-check.is-checked').waitFor();
  const second = await row(13).boundingBox();
  await page.mouse.click(blankX, second.y + second.height / 2);
  await row(13).locator('.bubble-check.is-checked').waitFor();
  await page.waitForTimeout(200);
  const geometryDuring = await bubble.boundingBox();
  const row12 = await row(12).boundingBox();
  const row13 = await row(13).boundingBox();
  const scroll = await page.locator('.chat-scroll').boundingBox();
  const y = row12.y + row12.height / 2;
  const pixels = await pixelsAt(page, [
    [scroll.x + 8, y],
    [row12.x + 4, y],
    [scroll.x + 8, row12.y + row12.height - 1],
    [scroll.x + 8, row13.y - 1],
    [scroll.x + 8, row13.y + 1],
    ...Array.from(
      { length: Math.ceil(row13.y - row12.y - row12.height) + 4 },
      (_, i) => [scroll.x + 8, Math.floor(row12.y + row12.height) - 2 + i]
    ),
  ]);
  const uniform = pixels.every((pixel) =>
    pixel.every((value, i) => Math.abs(value - pixels[0][i]) <= 1)
  );
  const separator = await row(13).evaluate((node) => ({
    className: node.previousElementSibling?.className,
    text: node.previousElementSibling?.textContent,
    day: node.previousElementSibling?.dataset.day ?? null,
  }));
  await page.screenshot({
    path: path.join(shots, `${before ? 'before' : 'after'}.png`),
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const geometryAfter = await bubble.boundingBox();
  for (const key of ['x', 'y', 'width', 'height']) {
    assert(
      Math.abs(geometryBefore[key] - geometryDuring[key]) <= 1,
      `stable selected ${key}`
    );
    assert(
      Math.abs(geometryBefore[key] - geometryAfter[key]) <= 1,
      `stable cleared ${key}`
    );
  }
  assert.equal(uniform, !before, 'original adjacent-row pixel assertion');
  assert.equal(
    Boolean(separator.day),
    before,
    'only parent inserts a date divider'
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      before,
      parent,
      fixtureClock,
      uniform,
      separator,
      gap: row13.y - row12.y - row12.height,
      row12,
      row13,
      pixelColors: [...new Set(pixels.map((p) => JSON.stringify(p)))],
      geometryStable: true,
      pageExceptions: errors,
      liveProvider: false,
    })
  );
} finally {
  await browser?.close();
  await handle?.close();
  await rm(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ resourcesClosed: true }));
}
