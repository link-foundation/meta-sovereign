async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { start, panel, action, page, owner, require, confirmed, errors } =
      tools;
    await start(undefined, 'form');
    const opened = await owner('draft-values');
    require(opened.entries === 0 &&
      opened.submissions === 0, 'Full form clicked entry or send');
    await owner('draft-owner-fill', 'POST');
    await owner('draft-owner-question-ru', 'POST');
    await action('read').click();
    await panel
      .locator('[data-application-resume-context]')
      .filter({ hasText: 'RU' })
      .waitFor();
    await confirmed('context-resume');
    await panel.locator('[data-application-resume-proof="ru"]').waitFor();
    let values = await owner('draft-values');
    require(values.entries === 0 &&
      values.submissions === 0 &&
      values.resume === 'english' &&
      values.resumeChoices ===
        1, 'Full-form review dispatched or failed résumé selection');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.letter ===
        'Actual edited owner letter.', 'Full-form résumé choice lost owner values');
    await panel.screenshot({
      path: 'docs/screenshots/application-fullform-after.png',
    });
    await tools.locales('resume-context', 'form');
    require(await action(
      'submit'
    ).isDisabled(), 'Read-only reload reused send confirmation');
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Full-form review overflows phone');
    await panel.screenshot({
      path: 'docs/screenshots/application-fullform-phone.png',
    });
    values = await owner('draft-values');
    require(values.entries === 0 &&
      values.submissions === 0 &&
      values.resumeChoices === 1, 'Reload repeated a native operation');
    await action('close').click();
    await tools.state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Full-form fixtures did not drain');
    return {
      fullFormNavigation: true,
      entryClicks: 0,
      sends: 0,
      checkedHash: values.resume,
      ownerValuesPreserved: true,
      fourLocales: true,
      browsersClosed: stats.closed,
      errors,
    };
  });
