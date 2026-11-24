async (originalPage) => {
  const source = new URL(originalPage.url());
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  const errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  const require = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };
  try {
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.goto(`${source.origin}/#/cv`);
    const vacancies = page.locator('[data-vacancies]');
    const panel = page.locator('[data-application-panel]');
    const action = (name) =>
      panel.locator(`[data-application-action="${name}"]`);
    const option = (name) =>
      panel.locator(`[data-application-option="${name}"]`);
    const state = (name) =>
      panel.locator(`[data-application-state="${name}"]`).waitFor();
    await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
    await vacancies.locator('[data-vacancy-action="search"]').click();
    await vacancies.locator('[data-vacancy-action="collect"]').first().click();
    await panel.locator('[data-application-missing]').waitFor();
    await option('testMode').check();
    await action('start').click();
    await state('ready');
    await option('confirm').check();
    await action('enter').click();
    await state('test-preview');
    await action('close').click();
    await state('closed');
    await option('testMode').uncheck();
    await panel
      .locator('[data-application-letter]')
      .fill('Independently reviewed owner letter.');
    await action('start').click();
    await state('ready');
    await option('paused').click();
    await state('paused');
    require(await option('paused').isChecked(), 'Pause was not acknowledged');
    await option('paused').click();
    await state('ready');
    await option('confirm').check();
    await action('enter').click();
    await state('review');
    await option('noQuestionnaires').click();
    await state('deferred');
    require(await option(
      'noQuestionnaires'
    ).isChecked(), 'Deferral was not acknowledged');
    await option('noQuestionnaires').click();
    await state('review');
    require(await action(
      'prefill'
    ).isDisabled(), 'Action confirmation survived a mode change');
    await option('confirm').check();
    await action('prefill').click();
    await panel.locator('[data-application-letter-state="verified"]').waitFor();
    await option('confirm').check();
    await action('submit').click();
    await panel
      .locator('[data-application-delivery="provider-confirmed"]')
      .waitFor();
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/application-mcp-delivered.png',
    });
    await action('close').click();
    await state('closed');
    require(await action(
      'start'
    ).isDisabled(), 'Delivered application could restart');
    require((await page.evaluate(() =>
      globalThis.localStorage.getItem('meta-sovereign:hh-application-intent')
    )) === null, 'Closed review retained its local pending identity');
    require(errors.length === 0, 'Native UI page errors');
    return {
      previewRestart: true,
      pauseResume: true,
      reversibleDeferral: true,
      confirmedDelivery: true,
      replayBlocked: true,
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
