import assert from 'node:assert/strict';
import { runnerApiFixture } from '../../../experiments/issue-56/runner-api-fixture.mjs';
import { serveOptions } from '../../src/cli/server-options.js';
import { watchFixturePages } from './e2e-page-errors.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';

const uiState = async (page, mode, theme, locale = 'ru', skin = 'signal') =>
  page.waitForFunction(
    ([m, t, l, s]) => {
      const root = document.documentElement;
      return (
        root.dataset.themeMode === m &&
        root.dataset.theme === t &&
        root.lang === l &&
        root.dataset.skin === s
      );
    },
    [mode, theme, locale, skin]
  );

const verifyTranslations = async (page, language, panel) => {
  for (const locale of ['en', 'ru', 'zh', 'hi']) {
    await language.selectOption(locale);
    await page.waitForFunction(
      (expected) => document.documentElement.lang === expected,
      locale
    );
    assert.ok(
      (await panel.locator('[data-action=appearance-reset]').innerText())
        .length > 0
    );
  }
};

/** Native owner choices outrank delayed configured defaults, including after reload. */
export const verifyUiDefaults = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await runnerApiFixture({
    serverOptions: serveOptions({
      tls: false,
      theme: 'auto',
      skin: 'signal',
      language: 'ru',
    }),
  });
  const context = await browser.newContext({
    locale: 'en-US',
    colorScheme: 'dark',
    viewport: { width: 1180, height: 1100 },
  });
  const errors = [];
  watchFixturePages(context, browser, fixture.base, errors);
  context.setDefaultTimeout(10000);
  let release;
  try {
    const page = await context.newPage();
    await page.clock.install({ time: new Date(2026, 10, 18, 12) });
    await page.addInitScript(
      ([key, version]) => {
        globalThis.localStorage.setItem(
          key,
          JSON.stringify({ off: true, v: version })
        );
      },
      [TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION]
    );
    let seen;
    const intercepted = new Promise((resolve) => {
      seen = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/api/ui/defaults', async (route) => {
      seen();
      await gate;
      await route.continue();
    });
    await page.goto(`${fixture.base}/#settings`);
    const panel = page.locator('.appearance');
    await panel.waitFor();
    if (before) {
      await panel.screenshot({ path: `${screenshots}/native-before.png` });
      assert.equal(
        await panel.locator('[data-action=appearance-reset]').count(),
        1
      );
    }
    await intercepted;
    const language = page.locator('[data-action=language-switcher] select');
    await panel.locator('input[name=theme-mode][value=light]').check();
    await language.selectOption('en');
    const response = page.waitForResponse(
      (reply) => new URL(reply.url()).pathname === '/api/ui/defaults'
    );
    release();
    assert.equal((await response).status(), 200);
    await page.waitForFunction(
      () => document.documentElement.dataset.skin === 'signal'
    );
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(
      await page.locator('html').getAttribute('data-theme-mode'),
      'light'
    );
    await panel.locator('[data-action=appearance-reset]').click();
    await language.selectOption('__system__');
    await uiState(page, 'auto', 'light');
    await page.clock.fastForward(7 * 60 * 60 * 1000);
    await uiState(page, 'auto', 'dark');
    assert.deepEqual(
      await page.evaluate(() =>
        ['metaSovereignTheme', 'metaSovereignSkin', 'metaSovereignLocale'].map(
          (key) => globalThis.localStorage.getItem(key)
        )
      ),
      [null, null, null]
    );
    await panel.locator('input[name=theme-mode][value=light]').check();
    await panel.locator('input[name=skin][value=telegram]').check();
    await language.selectOption('en');
    await page.reload();
    await uiState(page, 'light', 'light', 'en', 'telegram');
    await panel.locator('[data-action=appearance-reset]').click();
    await language.selectOption('__system__');
    await uiState(page, 'auto', 'dark');
    if (screenshots) {
      await panel.screenshot({ path: `${screenshots}/native-after.png` });
    }
    await verifyTranslations(page, language, panel);
    await language.selectOption('__system__');
    await uiState(page, 'auto', 'dark');
    await page.setViewportSize({ width: 390, height: 1400 });
    if (screenshots) {
      await panel.screenshot({ path: `${screenshots}/native-phone.png` });
    }
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(fixture.backend.calls, []);
    return {
      delayedDefaultsPreservedOwnerChoices: true,
      explicitChoicesSurviveReload: true,
      resetFollowsConfiguredDefaults: true,
      automaticDayNight: true,
      languages: 4,
      phoneFits: true,
      runnerCalls: 0,
      pageErrors: 0,
      liveProvider: false,
    };
  } finally {
    release?.();
    await context.close();
    await fixture.close();
  }
};
