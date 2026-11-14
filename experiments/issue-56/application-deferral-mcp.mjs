async (originalPage) => {
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
    require(response.ok(), 'Synthetic native owner fixture failed');
    return response.json();
  };
  const verifyDeferred = async (panel, action, confirm, state) => {
    require(await action(
      'defer'
    ).isDisabled(), 'Deferral must renew confirmation');
    await confirm();
    await action('defer').click();
    await state('closed');
    await panel.locator('[data-application-queued]').waitFor();
    const stats = await owner('stats');
    require(stats.closed, 'Deferral left an owned browser open');
    require(await action(
      'retry'
    ).isDisabled(), 'Retry must renew confirmation');
    await panel.locator('[data-application-queue]').screenshot({
      path: 'docs/screenshots/application-deferral-queued.png',
    });
    await page.reload();
    await panel.locator('[data-application-queued]').waitFor();
    require(await action(
      'retry'
    ).isDisabled(), 'Reload lost confirmation boundary');
    await confirm();
    await action('retry').click();
    await state('review');
    const fresh = await owner('draft-values');
    require(fresh.experience === '' &&
      fresh.letter === null &&
      fresh.entries === 0 &&
      fresh.submissions === 0, 'Queue reopening replayed an action');
    await owner('draft-owner-open-letter', 'POST');
    await action('read').click();
    await state('review');
    await confirm();
    await action('restore').click();
    await panel
      .locator('[data-application-restoration="restored"]')
      .waitFor({ state: 'attached' });
    const result = await owner('draft-values');
    require(result.experience === 'Owner-only questionnaire answer.' &&
      result.letter === 'Actual edited owner letter.' &&
      result.header === 'Owner header' &&
      result.submissions === 0, 'Owner answers or scope were not preserved');
    const intent = await page.evaluate(() =>
      JSON.parse(
        globalThis.localStorage.getItem('meta-sovereign:hh-application-intent')
      )
    );
    require(Object.keys(intent).sort().join(',') ===
      'browserSlot,requestId,url', 'Queue reasons or answers persisted in browser intent');
    await page.setViewportSize({ width: 390, height: 1000 });
    const draft = panel.locator('[data-application-draft]');
    if ((await draft.getAttribute('open')) === null) {
      await draft.locator(':scope > summary').click();
    }
    await draft.screenshot({
      path: 'docs/screenshots/application-deferral-restored-phone.png',
    });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Queue panel overflows the phone viewport');
  };
  try {
    await page.setViewportSize({ width: 1280, height: 1100 });
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
    const confirm = () =>
      panel.locator('[data-application-option="confirm"]').check();
    const state = (name) =>
      panel.locator(`[data-application-state="${name}"]`).waitFor();
    await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
    await vacancies.locator('[data-vacancy-action="search"]').click();
    await vacancies.locator('[data-vacancy-action="collect"]').first().click();
    await panel.locator('[data-application-missing]').waitFor();
    await action('start').click();
    await state('ready');
    await confirm();
    await action('enter').click();
    await state('review');
    await owner('draft-owner-fill', 'POST');
    await action('read').click();
    await state('review');
    if (before) {
      require((await action('defer').count()) ===
        0, 'Parent unexpectedly has backed deferral');
      await panel.screenshot({
        path: 'docs/screenshots/application-deferral-before.png',
      });
    } else {
      await verifyDeferred(panel, action, confirm, state);
    }
    await action('close').click();
    await state('closed');
    require(errors.length === 0, 'Application page errors');
    return {
      parentMissingDeferral: before,
      backedQuestionnaire: !before,
      queueSurvivesUiReload: !before,
      retryOnlyReviews: !before,
      restored: before ? 0 : 2,
      submissions: 0,
      identityOnlyIntent: !before,
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
