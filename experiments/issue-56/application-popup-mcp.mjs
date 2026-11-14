async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const {
      start,
      owner,
      panel,
      action,
      page,
      state,
      errors,
      require,
      confirmed,
      locales,
    } = tools;
    await start(async () =>
      panel
        .locator('[data-application-letter]')
        .fill('Actual edited owner letter.')
    );
    await owner('draft-owner-fill', 'POST');
    await confirmed('read');
    await confirmed('backup');
    await action('close').click();
    await state('closed');
    await action('recover').click();
    await state('interrupted');
    await action('reopen').click();
    await state('ready');
    let values = await owner('draft-values');
    require(values.entries === 0 &&
      values.submissions === 0 &&
      values.experience === null, 'Recovery repeated native entry');
    await locales('reentry', 'reenter');
    require(await action(
      'enter'
    ).isDisabled(), 'Original entry reservation was released');
    await panel.screenshot({
      path: 'docs/screenshots/application-popup-ready.png',
    });
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Popup recovery overflows phone');
    await panel.screenshot({
      path: 'docs/screenshots/application-popup-phone.png',
    });
    await confirmed('reenter');
    await state('review');
    values = await owner('draft-values');
    require(values.entries === 1 &&
      values.submissions === 0 &&
      values.experience === '', 'Re-entry restored or submitted a draft');
    await owner('draft-owner-open-letter', 'POST');
    await confirmed('read');
    await confirmed('restore');
    values = await owner('draft-values');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.letter === 'Actual edited owner letter.' &&
      values.header === 'Owner header' &&
      values.submissions === 0, 'Actual draft did not restore safely');
    require(await action(
      'submit'
    ).isDisabled(), 'Restoration reused submission confirmation');
    await panel.screenshot({
      path: 'docs/screenshots/application-popup-restored.png',
    });
    await confirmed('submit');
    await state('delivered');
    values = await owner('draft-values');
    require(values.entries === 1 &&
      values.submissions ===
        1, 'Native counters do not confirm one fresh entry and submission');
    await action('close').click();
    await state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Popup fixtures did not drain');
    return {
      automaticEntry: 0,
      confirmedReentry: 1,
      submissions: 1,
      restoredActualDraft: true,
      fourLocaleRecovery: true,
      phoneOverflow: false,
      browsersClosed: true,
      pageErrors: errors,
    };
  });
