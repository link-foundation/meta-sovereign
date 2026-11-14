async (originalPage, work) => {
  const source = new URL(originalPage.url());
  const control = source.searchParams.get('control');
  const before = source.searchParams.has('expect-parent');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const require = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const owner = async (operation, method = 'GET') => {
    const response = await page.request.fetch(`${control}/${operation}`, {
      method,
      headers: { connection: 'close' },
    });
    require(response.ok(), 'Synthetic native fixture refused control');
    return response.json();
  };
  try {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.addInitScript(() => {
      if (!globalThis.localStorage.getItem('metaSovereignLocale')) {
        globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      }
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.goto(`${source.origin}/#/cv`);
    const panel = page.locator('[data-application-panel]');
    const vacancies = page.locator('[data-vacancies]');
    const action = (name) =>
      panel.locator(`[data-application-action="${name}"]`);
    const state = (name) =>
      panel.locator(`[data-application-state="${name}"]`).waitFor();
    const confirm = () =>
      panel.locator('[data-application-option="confirm"]').check();
    const confirmed = async (name) => {
      await confirm();
      await action(name).click();
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-application-option="confirm"]')
            .checked &&
          !document.querySelector('[data-application-action="read"]').disabled
      );
    };
    const locales = async (attribute, blockedAction) => {
      for (const locale of ['ru', 'hi', 'zh', 'en']) {
        await page.evaluate(
          (value) =>
            globalThis.localStorage.setItem('metaSovereignLocale', value),
          locale
        );
        await page.reload();
        await panel.locator(`[data-application-${attribute}]`).waitFor();
        require(!(await panel.innerText()).includes(
          'application.'
        ), 'Recovery hint is untranslated');
        require(await action(
          blockedAction
        ).isDisabled(), 'Locale recovery reused confirmation');
      }
    };
    const start = async (settings = async () => {}, entry = 'enter') => {
      await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
      await vacancies.locator('[data-vacancy-action="search"]').click();
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .click();
      await panel.locator('[data-application-missing]').waitFor();
      await settings(panel);
      await action('start').click();
      await state('ready');
      await confirm();
      await action(entry).click();
      await state('review');
    };
    return await work({
      source,
      before,
      page,
      errors,
      require,
      owner,
      panel,
      action,
      state,
      confirm,
      confirmed,
      locales,
      start,
    });
  } finally {
    await context.close();
  }
};
