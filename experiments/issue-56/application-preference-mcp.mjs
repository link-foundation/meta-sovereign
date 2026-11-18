async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { start, panel, action, page, owner, require, confirmed, errors } =
      tools;
    await start(undefined, 'form');
    await owner('draft-owner-fill', 'POST');
    await owner('draft-owner-question-ru', 'POST');
    await action('read').click();
    await panel
      .locator('[data-application-resume-context]')
      .filter({ hasText: 'RU' })
      .waitFor();
    await confirmed('context-resume');
    await panel
      .locator('[data-application-resume-preference="context"]')
      .waitFor();
    await owner('draft-owner-resume-old', 'POST');
    await action('read').click();
    const saved = panel.locator(
      '[data-application-resume-preference="native"]'
    );
    await saved.waitFor();
    require((await saved.innerText()).includes(
      'Старое резюме'
    ), 'Native owner change was not retained');
    await panel
      .locator('[data-application-resume-title]')
      .locator('..')
      .screenshot({
        path: 'docs/screenshots/application-preference-after.png',
      });
    await tools.locales('resume-preference="native"', 'submit');
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Saved CV history overflows phone');
    await panel
      .locator('[data-application-resume-title]')
      .locator('..')
      .screenshot({
        path: 'docs/screenshots/application-preference-phone.png',
      });
    const values = await owner('draft-values');
    require(values.resume === 'russian-old' &&
      values.resumeChoices === 2 &&
      values.entries === 0 &&
      values.submissions === 0, 'Recovery changed or sent the native CV');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.letter ===
        'Actual edited owner letter.', 'CV history lost owner values');
    await action('close').click();
    await tools.state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'CV history fixtures did not drain');
    return {
      acknowledgedResumeHistory: true,
      retainedNativeChoice: true,
      fourLocales: true,
      entryClicks: 0,
      sends: 0,
      ownerValuesPreserved: true,
      browsersClosed: stats.closed,
      errors,
    };
  });
