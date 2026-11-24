async (originalPage, options) => {
  const context = await originalPage
    .context()
    .browser()
    .newContext({
      locale: 'en-US',
      colorScheme: 'light',
      viewport: { width: 1180, height: 1100 },
    });
  const errors = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.addInitScript(() => {
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        JSON.stringify({ off: true, v: 5 })
      );
    });
    await page.goto(`${options.base}/#settings`);
    const panel = page.locator('.appearance');
    await panel.waitFor();
    if (options.before) {
      await panel.screenshot({
        path: 'docs/screenshots/issue-56-ui-defaults/mcp-before.png',
      });
    }
    await page.waitForFunction(
      () =>
        document.documentElement.lang === 'ru' &&
        document.documentElement.dataset.themeMode === 'dark' &&
        document.documentElement.dataset.skin === 'signal',
      null,
      { timeout: 10000 }
    );
    const require = (ok, message) => {
      if (!ok) {
        throw new Error(message);
      }
    };
    const language = page.locator('[data-action=language-switcher] select');
    await panel.locator('input[name=theme-mode][value=light]').check();
    await panel.locator('input[name=skin][value=telegram]').check();
    await language.selectOption('en');
    await page.reload();
    await page.waitForFunction(
      () =>
        document.documentElement.lang === 'en' &&
        document.documentElement.dataset.themeMode === 'light' &&
        document.documentElement.dataset.skin === 'telegram'
    );
    await panel.locator('[data-action=appearance-reset]').click();
    await language.selectOption('__system__');
    await page.waitForFunction(
      () =>
        document.documentElement.lang === 'ru' &&
        document.documentElement.dataset.themeMode === 'dark' &&
        document.documentElement.dataset.skin === 'signal'
    );
    require(await page.evaluate(() =>
      ['metaSovereignTheme', 'metaSovereignSkin', 'metaSovereignLocale'].every(
        (key) => globalThis.localStorage.getItem(key) === null
      )
    ), 'Reset retained a browser override');
    await panel.screenshot({
      path: 'docs/screenshots/issue-56-ui-defaults/mcp-after.png',
    });
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      await language.selectOption(locale);
      await page.waitForFunction(
        (expected) => document.documentElement.lang === expected,
        locale
      );
      require((
        await panel.locator('[data-action=appearance-reset]').innerText()
      ).length > 0, 'Missing reset translation');
    }
    await language.selectOption('__system__');
    await page.waitForFunction(() => document.documentElement.lang === 'ru');
    await page.setViewportSize({ width: 390, height: 1400 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Defaults panel overflows phone');
    await panel.screenshot({
      path: 'docs/screenshots/issue-56-ui-defaults/mcp-phone.png',
    });
    await page.reload();
    await page.waitForFunction(
      () =>
        document.documentElement.lang === 'ru' &&
        document.documentElement.dataset.themeMode === 'dark' &&
        document.documentElement.dataset.skin === 'signal'
    );
    require(errors.length === 0, errors.join('\n'));
    return {
      sharedDefaultsApplied: true,
      ownerChoicesSurviveReload: true,
      resetRetainedAfterReload: true,
      locales: 4,
      phoneFits: true,
      liveProvider: false,
      errors,
    };
  } finally {
    await context.close();
  }
};
