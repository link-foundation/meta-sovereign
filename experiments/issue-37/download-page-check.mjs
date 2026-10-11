/**
 * Render the download landing page (issue #37) in Chromium, the way
 * GitHub Pages serves it, and screenshot three states:
 *
 *   - ready:    the GitHub API returns a release with every desktop
 *               asset (mocked; the first real desktop release only
 *               exists after this PR is merged);
 *   - fallback: the API answers 403 (rate limit), so the page points
 *               to the releases page;
 *   - mobile:   Russian UI on a phone-sized viewport.
 *
 * Usage (after `node js/scripts/build-pages.mjs`):
 *
 *   node experiments/issue-37/download-page-check.mjs [outDir]
 *
 * Prints one JSON line per state and exits non-zero on console errors
 * or a missing primary download button.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';

import { chromium } from 'playwright';

import { expectedReleaseAssets } from '../../js/src/web/download/downloads.js';
import { ROOT, servePages } from './pages-server.mjs';

const OUT = path.resolve(
  process.argv[2] ?? path.join(ROOT, 'docs/screenshots/issue-37')
);
const VERSION = '0.21.0';

const mockRelease = () => [
  {
    tag_name: `v${VERSION}`,
    html_url: `https://github.com/link-foundation/meta-sovereign/releases/tag/v${VERSION}`,
    draft: false,
    prerelease: false,
    assets: expectedReleaseAssets(VERSION).map((name, i) => ({
      name,
      size:
        name.endsWith('.yml') || name.endsWith('.txt')
          ? 900
          : (95 + i) * 1024 * 1024,
      browser_download_url: `https://github.com/link-foundation/meta-sovereign/releases/download/v${VERSION}/${name}`,
    })),
  },
];

const LINUX_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const STATES = [
  {
    name: 'ready',
    api: { status: 200, body: mockRelease() },
    ua: LINUX_UA,
    viewport: { width: 1280, height: 900 },
    locale: 'en',
  },
  {
    name: 'fallback',
    api: { status: 403, body: { message: 'API rate limit exceeded' } },
    ua: LINUX_UA,
    viewport: { width: 1280, height: 900 },
    locale: 'en',
  },
  {
    name: 'mobile-ru',
    api: { status: 200, body: mockRelease() },
    ua: IPHONE_UA,
    viewport: { width: 390, height: 844 },
    locale: 'ru',
  },
];

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const { server, base: site } = await servePages();
  const base = `${site}download/`;
  const browser = await chromium.launch({ channel: 'chromium' });
  let failed = false;
  try {
    for (const state of STATES) {
      const context = await browser.newContext({
        userAgent: state.ua,
        viewport: state.viewport,
        locale: state.locale,
      });
      const page = await context.newPage();
      const errors = [];
      // The mocked 403 is logged by the browser itself; anything else
      // (or any 403 in the other states) is a real failure.
      const expected = (text) =>
        state.api.status !== 200 && text.includes(`${state.api.status}`);
      page.on(
        'console',
        (msg) =>
          msg.type() === 'error' &&
          !expected(msg.text()) &&
          errors.push(msg.text())
      );
      page.on('pageerror', (err) => errors.push(err.message));
      await page.route('https://api.github.com/**', (route) =>
        route.fulfill({
          status: state.api.status,
          contentType: 'application/json',
          body: JSON.stringify(state.api.body),
        })
      );
      await page.goto(base);
      await page.waitForFunction(
        () => document.getElementById('root').dataset.status !== 'loading'
      );
      const report = await page.evaluate(() => ({
        status: document.getElementById('root').dataset.status,
        os: document.getElementById('root').dataset.os,
        arch: document.getElementById('root').dataset.arch,
        lang: document.documentElement.lang,
        title: document.title,
        primary:
          document.querySelector('.primary-download')?.getAttribute('href') ??
          null,
        primaryText:
          document.querySelector('.hero .primary-download .label, .hero .note')
            ?.textContent ?? null,
        links: document.querySelectorAll('a.download').length,
        unavailable: document.querySelectorAll('.download.unavailable').length,
        icon: document.querySelector('.brand img')?.naturalWidth ?? 0,
      }));
      const file = path.join(OUT, `download-page-${state.name}.png`);
      await page.screenshot({
        path: file,
        fullPage: state.name !== 'mobile-ru',
      });
      console.log(
        JSON.stringify({
          state: state.name,
          ...report,
          errors,
          screenshot: path.relative(ROOT, file),
        })
      );
      if (errors.length || !report.icon || !report.primary) {
        failed = true;
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(failed ? 1 : 0);
};

await main();
