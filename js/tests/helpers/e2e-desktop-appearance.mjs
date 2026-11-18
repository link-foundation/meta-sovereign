import assert from 'node:assert/strict';
import { runnerApiFixture } from '../../../experiments/issue-56/runner-api-fixture.mjs';
import { watchFixturePages } from './e2e-page-errors.mjs';
import { verifyUiDefaults } from './e2e-ui-defaults.mjs';
import { captureVkAutomationLayouts } from './vk-automation-browser.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';

const localeIs = (page, locale) =>
  page.waitForFunction(
    (expected) => document.documentElement.lang === expected,
    locale
  );

const themeIs = (page, mode, theme) =>
  page.waitForFunction(
    ([choice, resolved]) =>
      document.documentElement.dataset.themeMode === choice &&
      document.documentElement.dataset.theme === resolved,
    [mode, theme]
  );

const themes = async (page, screenshots) => {
  const choose = async (mode, theme) => {
    await page.locator(`input[name=theme-mode][value=${mode}]`).check();
    await themeIs(page, mode, theme);
  };
  await themeIs(page, 'system', 'dark');
  await choose('light', 'light');
  await page.reload();
  await themeIs(page, 'light', 'light');
  await choose('dark', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await themeIs(page, 'dark', 'dark');
  await choose('system', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await themeIs(page, 'system', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await themeIs(page, 'system', 'light');
  await page.reload();
  await themeIs(page, 'system', 'light');
  await captureVkAutomationLayouts(
    page,
    page.locator('.appearance'),
    screenshots,
    'system-theme-russian',
    true
  );
};

/** Same shared shell as Electron, without an owner profile or provider account. */
export const verifyDesktopAppearance = async (browser) => {
  const fixture = await runnerApiFixture();
  const errors = [];
  const detected = [];
  try {
    for (const locale of ['ru', 'en']) {
      const context = await browser.newContext({
        locale: `${locale}-${locale === 'ru' ? 'RU' : 'US'}`,
        colorScheme: 'dark',
        viewport: { width: 1180, height: 950 },
      });
      watchFixturePages(context, browser, fixture.base, errors);
      context.setDefaultTimeout(10000);
      try {
        const page = await context.newPage();
        await page.addInitScript(
          ([key, version]) => {
            globalThis.localStorage.setItem(
              key,
              JSON.stringify({ off: true, v: version })
            );
          },
          [TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION]
        );
        await page.goto(`${fixture.base}/#settings`);
        await localeIs(page, locale);
        detected.push(await page.locator('html').getAttribute('lang'));
        const select = page.locator('[data-action=language-switcher] select');
        const explicit = locale === 'ru' ? 'en' : 'ru';
        await select.selectOption(explicit);
        await localeIs(page, explicit);
        await page.reload();
        await localeIs(page, explicit);
        await select.selectOption('__system__');
        await localeIs(page, locale);
        assert.equal(
          await page.evaluate(() =>
            globalThis.localStorage.getItem('metaSovereignLocale')
          ),
          null
        );
        if (locale === 'ru') {
          await themes(
            page,
            process.env.DESKTOP_APPEARANCE_SCREENSHOTS === '1'
              ? 'docs/screenshots/issue-56-desktop-appearance'
              : undefined
          );
        }
      } finally {
        await context.close();
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(fixture.backend.calls, []);
    return {
      detectedLocales: detected,
      explicitLocaleRetained: true,
      localeReset: true,
      themeModes: 3,
      systemChanges: 2,
      explicitThemeRetained: true,
      runnerCalls: 0,
      pageErrors: 0,
      liveProvider: false,
      configuredDefaults: await verifyUiDefaults(browser),
    };
  } finally {
    await fixture.close();
  }
};
