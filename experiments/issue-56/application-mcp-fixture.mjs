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
    const start = async (settings = async () => {}) => {
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
      await action('enter').click();
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
      start,
    });
  } finally {
    await context.close();
  }
};
