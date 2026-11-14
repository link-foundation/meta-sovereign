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
      before,
    } = tools;
    await start();
    await owner('draft-owner-fill', 'POST');
    await owner('draft-owner-question-ru', 'POST');
    await action('read').click();
    await panel.locator('[data-application-resume-title]').waitFor();
    const chooser = panel
      .locator('[data-application-resume-title]')
      .locator('..');
    if (before) {
      await chooser.screenshot({
        path: 'docs/screenshots/application-context-before.png',
      });
      require((await action('context-resume').count()) ===
        0, 'Published parent unexpectedly supports contextual choice');
      await action('close').click();
      await tools.state('closed');
      return {
        contextualChoicePresent: false,
        browsersClosed: (await owner('stats')).closed,
        errors,
      };
    }
    await panel
      .locator('[data-application-resume-context]')
      .filter({ hasText: 'RU' })
      .waitFor();
    require(await action(
      'context-resume'
    ).isDisabled(), 'Context choice reused confirmation');
    await confirmed('context-resume');
    await panel.locator('[data-application-resume-proof="ru"]').waitFor();
    const selected = await owner('draft-values');
    await confirmed('context-resume');
    const passive = await owner('draft-values');
    require(passive.resumeMenus === selected.resumeMenus &&
      passive.resumeChoices ===
        selected.resumeChoices, 'Already correct CV reopened its menu');
    await owner('draft-owner-resume-old', 'POST');
    await action('read').click();
    await panel
      .locator('[data-application-resume-title]')
      .filter({ hasText: 'Старое резюме' })
      .waitFor();
    await confirmed('context-resume');
    const values = await owner('draft-values');
    require(values.resume === 'english' &&
      values.resumeChoices === 3 &&
      values.experience === 'Owner-only questionnaire answer.' &&
      values.letter === 'Actual edited owner letter.' &&
      values.submissions ===
        0, 'Contextual choice lost owner values or sent an application');
    await chooser.screenshot({
      path: 'docs/screenshots/application-context-after.png',
    });
    await tools.locales('resume-context', 'context-resume');
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Context controls overflow phone');
    await chooser.screenshot({
      path: 'docs/screenshots/application-context-phone.png',
    });
    require((await owner('draft-values')).resumeChoices ===
      3, 'Read-only recovery replayed context selection');
    await action('close').click();
    await tools.state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Context browsers failed to drain');
    return {
      checkedHash: values.resume,
      exportLanguage: 'ru',
      reason: 'questions',
      sends: values.submissions,
      ownerValuesPreserved: true,
      passiveMenuClicks: 0,
      fourLocales: true,
      browsersClosed: stats.closed,
      errors,
    };
  });
