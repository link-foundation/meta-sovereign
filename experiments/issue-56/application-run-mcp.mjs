async (originalPage) => {
  const source = new URL(originalPage.url());
  const parent = source.searchParams.has('expect-parent');
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
  try {
    await page.setViewportSize({ width: 1280, height: 1440 });
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
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
    const option = (name) =>
      panel.locator(`[data-application-option="${name}"]`);
    const toggle = async (name, checked) => {
      await option(name).click();
      await page.waitForFunction(
        ({ name, checked }) =>
          globalThis.document.querySelector(
            `[data-application-option="${name}"]`
          )?.checked === checked,
        { name, checked }
      );
    };
    const state = (name) =>
      panel.locator(`[data-application-state="${name}"]`).waitFor();
    await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
    await vacancies.locator('[data-vacancy-action="search"]').click();
    await vacancies.locator('[data-vacancy-action="collect"]').first().click();
    await panel.locator('[data-application-missing]').waitFor();
    await action('start').click();
    await state('ready');
    await toggle('noQuestionnaires', true);
    await toggle('paused', true);
    await state('paused');
    await action('close').click();
    await state('closed');
    await action('recover').click();
    await state('interrupted');
    await action('reopen').click();
    await state(parent ? 'ready' : 'paused');
    require((await option('noQuestionnaires').isChecked()) ===
      !parent, 'Worker questionnaire policy mismatch');
    require((await option('paused').isChecked()) ===
      !parent, 'Worker pause mismatch');
    if (parent) {
      await panel.screenshot({
        path: 'docs/screenshots/application-run-before.png',
      });
    } else {
      await panel.screenshot({
        path: 'docs/screenshots/application-run-retained.png',
      });
      await toggle('paused', false);
      await state('ready');
      await toggle('confirm', true);
      await action('enter').click();
      await state('deferred');
      require(await action(
        'prefill'
      ).isDisabled(), 'Deferred form permitted filling');
      require(await action(
        'submit'
      ).isDisabled(), 'Deferred form permitted sending');
      await page.setViewportSize({ width: 390, height: 1000 });
      await panel.screenshot({
        path: 'docs/screenshots/application-run-deferred-phone.png',
      });
      await toggle('noQuestionnaires', false);
      await state('review');
      const saved = await page.evaluate(() =>
        JSON.parse(
          globalThis.localStorage.getItem(
            'meta-sovereign:hh-application-intent'
          )
        )
      );
      require(Object.keys(saved).sort().join(',') ===
        'browserSlot,requestId,url', 'Run modes leaked into durable browser intent');
    }
    await action('close').click();
    await state('closed');
    require(errors.length === 0, 'Application page errors');
    return {
      parentLostPolicy: parent,
      workerModesRetained: !parent,
      resumedReviewOnly: !parent,
      identityOnlyIntent: !parent,
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
