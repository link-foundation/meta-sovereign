import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { desktopLandingFixture } from '../../../experiments/issue-56/desktop-landing-browser-fixture.mjs';
import {
  landingRelease,
  partialLandingRelease,
  unfinishedLandingRelease,
} from '../../../experiments/issue-56/desktop-landing-fixture.mjs';
import { RELEASES_URL } from '../../src/web/download/downloads.js';

export const verifyDesktopLanding = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await desktopLandingFixture();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const errors = [];
  let calls = 0;
  let releases = [partialLandingRelease()];
  let status = 200;
  let installerDownloads = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://github.com/**/releases/download/**', (route) => {
    installerDownloads += 1;
    return route.abort();
  });
  await page.route('https://api.github.com/**', (route) => {
    calls += 1;
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(releases),
    });
  });
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: path.join(screenshots, `${name}.png`),
        fullPage: true,
      });
    }
  };
  const open = async () => {
    await page.goto(`${fixture.base}/download/`);
    await page.waitForFunction(
      () => document.getElementById('root').dataset.status !== 'loading'
    );
  };
  try {
    await open();
    const windows = page.locator('.grid [data-option="windows-installer-x64"]');
    if (before) {
      assert.match(
        await windows.getAttribute('href'),
        /windows-installer-x64/u
      );
      await shot('before-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await shot('before-phone');
      return { unfinishedUploadLinked: true };
    }
    assert.equal(await windows.getAttribute('href'), null);
    assert.equal(await windows.getAttribute('aria-disabled'), 'true');
    assert.equal(
      await page.locator('.primary-download').getAttribute('href'),
      RELEASES_URL
    );
    assert.equal(await page.locator('.grid a.download').count(), 13);
    await shot('after-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.locator('.locale select').selectOption(locale);
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > globalThis.innerWidth
        ),
        false
      );
      assert.equal(await windows.getAttribute('href'), null);
    }
    await shot('after-phone');
    await page.reload();
    await page.waitForFunction(
      () => document.getElementById('root').dataset.status === 'ready'
    );
    assert.equal(calls, 1);
    assert.equal(await windows.getAttribute('href'), null);
    releases = [unfinishedLandingRelease(), landingRelease('1.2.2')];
    await page.evaluate(() => globalThis.sessionStorage.clear());
    await open();
    assert.equal(await page.locator('.status a').innerText(), 'v1.2.2');
    assert.equal(await page.locator('.grid a.download').count(), 14);
    status = 403;
    await page.evaluate(() => globalThis.sessionStorage.clear());
    await open();
    assert.equal(
      await page.locator('#root').getAttribute('data-status'),
      'fallback'
    );
    assert.equal(await page.locator('.grid a.download').count(), 0);
    assert.equal(
      await page.locator('.primary-download').getAttribute('href'),
      RELEASES_URL
    );
    assert.deepEqual(errors, []);
    assert.equal(installerDownloads, 0);
    return {
      unfinishedUploadLinked: false,
      availablePartial: 13,
      previousRelease: 'v1.2.2',
      locales: 4,
      cacheRetainsState: true,
      apiFailureFallback: true,
      installerDownloads,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
