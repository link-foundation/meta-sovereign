/**
 * Browser-only mode of the SPA on GitHub Pages (issue #37), in
 * Chromium:
 *
 *   1. no local server answers → the notice shows the npm and GitHub
 *      npx commands, "Check again" and the download link;
 *   2. "Check again" while still no server → "still no server";
 *   3. a server appears on 127.0.0.1:8787 → "Check again" reloads and
 *      the SPA comes up online without the notice;
 *   4. Russian UI with an iPhone Safari user agent → Safari hint.
 *
 * Every 127.0.0.1 API call is answered by `page.route`, so whatever
 * runs on this machine's ports does not change the result.
 *
 * Usage (after `npm run build:web && node js/scripts/build-pages.mjs`):
 *
 *   node experiments/issue-37/web-mode-check.mjs [outDir]
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';

import { chromium } from 'playwright';

import { ROOT, servePages } from './pages-server.mjs';

const OUT = path.resolve(
  process.argv[2] ?? path.join(ROOT, 'docs/screenshots/issue-37')
);
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const banner = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.web-mode-banner');
    const badge = document.querySelector('.mode-badge').className;
    if (!el) {
      return { badge, shown: false };
    }
    return {
      badge,
      shown: true,
      runtime: el.dataset.runtime,
      title: el.querySelector('h2').textContent,
      commands: [...el.querySelectorAll('pre')].map((pre) => pre.textContent),
      download: el.querySelector('a')?.getAttribute('href') ?? null,
      status: el.querySelector('[role=status]')?.textContent ?? null,
      safari: el.textContent.includes('Safari'),
    };
  });

const openSpa = async (browser, base, { locale, userAgent, viewport }) => {
  const context = await browser.newContext({ locale, userAgent, viewport });
  await context.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignTutorial', '{"off":true}');
  });
  const page = await context.newPage();
  // Mutable switch: flip `server.up` to make 127.0.0.1:8787 appear.
  const server = { up: false };
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/api\//, (route) => {
    const url = new URL(route.request().url());
    if (server.up && url.port === '8787') {
      return route.fulfill({ status: 200, json: { links: 0, ok: true } });
    }
    return route.abort('connectionrefused');
  });
  await page.goto(base);
  await page.waitForSelector('.mode-badge.offline');
  return { context, page, server };
};

const check = (label, ok, details) => {
  console.log(JSON.stringify({ step: label, ok, ...details }));
  return ok;
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const { server: http, base } = await servePages();
  const browser = await chromium.launch({ channel: 'chromium' });
  const results = [];
  try {
    const desk = await openSpa(browser, base, {
      locale: 'en',
      viewport: { width: 1280, height: 900 },
    });
    await desk.page.waitForSelector('.web-mode-banner');
    const offline = await banner(desk.page);
    await desk.page.screenshot({
      path: path.join(OUT, 'web-mode-offline.png'),
    });
    results.push(
      check('offline', offline.shown && offline.commands.length === 2, offline)
    );

    await desk.page.click('[data-action=web-mode-retry]');
    await desk.page.waitForFunction(() =>
      document
        .querySelector('.web-mode-banner [role=status]')
        ?.textContent.includes('Still no server')
    );
    results.push(
      check('retry-not-found', true, {
        status: (await banner(desk.page)).status,
      })
    );

    desk.server.up = true;
    await Promise.all([
      desk.page.waitForNavigation(),
      desk.page.click('[data-action=web-mode-retry]'),
    ]);
    await desk.page.waitForSelector('.mode-badge.online');
    const online = await banner(desk.page);
    results.push(check('retry-found', !online.shown, online));
    await desk.context.close();

    const phone = await openSpa(browser, base, {
      locale: 'ru',
      userAgent: IPHONE_UA,
      viewport: { width: 390, height: 844 },
    });
    await phone.page.waitForSelector('.web-mode-banner');
    const mobile = await banner(phone.page);
    await phone.page.locator('.web-mode-banner').screenshot({
      path: path.join(OUT, 'web-mode-mobile-ru.png'),
    });
    results.push(
      check('mobile-ru-safari', mobile.shown && mobile.safari, mobile)
    );
    await phone.context.close();
  } finally {
    await browser.close();
    http.close();
  }
  process.exit(results.every(Boolean) ? 0 : 1);
};

await main();
