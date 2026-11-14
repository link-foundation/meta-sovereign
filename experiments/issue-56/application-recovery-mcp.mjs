async (originalPage) => {
  const source = new URL(originalPage.url());
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 1440 });
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
    await panel
      .locator('[data-application-letter]')
      .fill('Original independently reviewed letter.');
    await action('start').click();
    await state('ready');
    await option('confirm').check();
    await action('enter').click();
    await state('review');
    await action('close').click();
    await state('closed');
    await action('recover').click();
    await state('interrupted');
    await action('reopen').click();
    if (source.searchParams.has('expect-parent-refusal')) {
      await state('ready');
      require(await action(
        'enter'
      ).isDisabled(), 'Parent did not retain its entry reservation');
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: 'docs/screenshots/application-recovery-before.png',
      });
      await action('close').click();
      await state('closed');
      return { parentReadyBlocked: true, pageErrors: errors };
    }
    await state('review');
    require(await action(
      'enter'
    ).isDisabled(), 'Recovered form allowed another entry');
    require(await action(
      'prefill'
    ).isDisabled(), 'Recovery reused action confirmation');
    await page.reload();
    await state('review');
    require(await action(
      'prefill'
    ).isDisabled(), 'Reload reused action confirmation');
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/application-recovered.png',
    });
    await option('confirm').check();
    await action('prefill').click();
    await panel.locator('[data-application-letter-state="verified"]').waitFor();
    await option('confirm').check();
    await action('submit').click();
    await panel
      .locator('[data-application-delivery="provider-confirmed"]')
      .waitFor();
    await action('close').click();
    await state('closed');
    require(errors.length === 0, 'Native UI page errors');
    return {
      recoveredForm: true,
      entryBlocked: true,
      confirmationRequired: true,
      readOnlyReload: true,
      originalLetterVerified: true,
      confirmedDelivery: true,
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
