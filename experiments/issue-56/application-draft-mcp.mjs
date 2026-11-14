async (originalPage) => {
  const source = new URL(originalPage.url());
  const control = source.searchParams.get('control');
  const parent = source.searchParams.has('expect-parent');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1280, height: 1440 });
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
    require(response.ok(), 'Isolated native owner fixture failed');
    return response.json();
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
    const panel = page.locator('[data-application-panel]');
    const vacancies = page.locator('[data-vacancies]');
    const action = (name) =>
      panel.locator(`[data-application-action="${name}"]`);
    const confirm = () =>
      panel.locator('[data-application-option="confirm"]').check();
    const state = (name) =>
      panel.locator(`[data-application-state="${name}"]`).waitFor();
    const startReview = async () => {
      await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
      await vacancies.locator('[data-vacancy-action="search"]').click();
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .click();
      await panel.locator('[data-application-missing]').waitFor();
      await action('start').click();
      await state('ready');
      await confirm();
      await action('enter').click();
      await state('review');
      await owner('draft-owner-fill', 'POST');
      await action('read').click();
      await state('review');
    };
    const reopen = async () => {
      await action('close').click();
      await state('closed');
      await action('recover').click();
      await state('interrupted');
      await action('reopen').click();
      await state('review');
    };
    const finish = async () => {
      await action('close').click();
      await state('closed');
      require(errors.length === 0, 'Application page errors');
    };
    await startReview();
    if (parent) {
      require((await action('backup').count()) === 0, 'Parent has Backup');
      await panel.screenshot({
        path: 'docs/screenshots/application-draft-before.png',
      });
    } else {
      require(await action('backup').isDisabled(), 'Renew backup approval');
      await confirm();
      await action('backup').click();
      await panel.locator('[data-application-draft]').waitFor();
      await panel.locator('[data-application-draft] > summary').click();
      require((
        await panel.locator('[data-application-draft]').innerText()
      ).includes(
        'Actual edited owner letter.'
      ), 'Actual owner letter absent from saved review');
    }
    await reopen();
    const fresh = await owner('draft-values');
    require(fresh.experience === '' &&
      fresh.letter === null &&
      fresh.entries === 0 &&
      fresh.submissions === 0, 'Reopen unexpectedly restored or dispatched');
    if (parent) {
      await finish();
      return {
        parentMissingBackup: true,
        parentOwnerAnswersLost: true,
        pageErrors: errors,
      };
    }
    await owner('draft-owner-open-letter', 'POST');
    await action('read').click();
    await state('review');
    require(await action('restore').isDisabled(), 'Renew restore approval');
    await page.reload();
    await state('review');
    require(await action('restore').isDisabled(), 'Renew reload approval');
    await confirm();
    await action('restore').click();
    await panel
      .locator('[data-application-restoration="restored"]')
      .waitFor({ state: 'attached' });
    const result = await owner('draft-values');
    require(result.experience === 'Owner-only questionnaire answer.' &&
      result.letter ===
        'Actual edited owner letter.', 'Native draft values were not restored');
    require(result.header === 'Owner header' &&
      result.entries === 0 &&
      result.submissions ===
        0, 'Restoration changed owner header or dispatched an application');
    const saved = await page.evaluate(() =>
      JSON.parse(
        globalThis.localStorage.getItem('meta-sovereign:hh-application-intent')
      )
    );
    require(Object.keys(saved).sort().join(',') ===
      'browserSlot,requestId,url', 'Private values leaked into local intent');
    const draft = panel.locator('[data-application-draft]');
    if (!((await draft.getAttribute('open')) !== null)) {
      await draft.locator(':scope > summary').click();
    }
    await panel.screenshot({
      path: 'docs/screenshots/application-draft-restored.png',
    });
    await finish();
    return {
      actualOwnerDraft: true,
      confirmationRequired: true,
      readOnlyReopen: true,
      restored: 2,
      submissions: 0,
      ownerHeaderPreserved: true,
      privateIntent: true,
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
