async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const {
      start,
      panel,
      action,
      owner,
      require,
      page,
      errors,
      confirmed,
      confirm,
    } = tools;
    await start();
    await owner('draft-owner-fill', 'POST');
    await action('read').click();
    await panel.locator('[data-application-resume-title]').waitFor();
    require(await action(
      'resume-menu'
    ).isDisabled(), 'Read reused confirmation');
    await confirmed('resume-menu');
    const choice = panel.locator('[data-application-resume="english"]');
    await choice.waitFor();
    require(await choice.isDisabled(), 'Menu reused choice confirmation');
    await confirm();
    await choice.click();
    await panel.locator('[data-application-resume-proof="ru"]').waitFor();
    const values = await owner('draft-values');
    require(values.resume === 'english' &&
      values.resumeChoices === 1 &&
      values.experience === 'Owner-only questionnaire answer.' &&
      values.letter === 'Actual edited owner letter.' &&
      values.submissions ===
        0, 'Native choice lost owner values or sent an application');
    await panel.screenshot({
      path: 'docs/screenshots/application-resume-after.png',
    });
    await tools.locales('resume-title', 'resume-menu');
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Resume controls overflow phone');
    await panel.screenshot({
      path: 'docs/screenshots/application-resume-phone.png',
    });
    require((await owner('draft-values')).resumeChoices ===
      1, 'Read-only recovery replayed selection');
    await action('close').click();
    await tools.state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Owned browsers failed to drain');
    return {
      checkedHash: values.resume,
      exportLanguage: 'ru',
      sends: values.submissions,
      ownerValuesPreserved: true,
      fourLocales: true,
      browsersClosed: stats.closed,
      errors,
    };
  });
