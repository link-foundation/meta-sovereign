async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { start, panel, confirmed, owner, require, page, action, errors } =
      tools;
    await start(async () => {
      await panel
        .locator('[data-application-option="autoSelectResumeLanguage"]')
        .check();
      await panel
        .locator('[data-application-option="standardLetters"]')
        .check();
      await panel
        .locator('[data-application-standard-letter="en"]')
        .fill('Reviewed English standard letter.');
      await panel
        .locator('[data-application-standard-letter="ru"]')
        .fill('Проверенное стандартное письмо.');
      await panel.locator('[data-application-option="supervised"]').check();
    });
    await panel
      .locator('[data-application-resume-preference="automatic"]')
      .waitFor();
    await confirmed('letter');
    let values = await owner('draft-values');
    require(values.letter === 'Проверенное стандартное письмо.' &&
      values.resumeChoices === 1, 'Russian initial standard letter is wrong');
    await owner('draft-owner-question-usd', 'POST');
    await confirmed('read');
    await confirmed('letter');
    values = await owner('draft-values');
    require(values.letter === 'Reviewed English standard letter.' &&
      values.resumeChoices ===
        2, 'Unchanged standard letter was not corrected');
    await owner('draft-owner-fill', 'POST');
    await owner('draft-owner-question-ru', 'POST');
    await confirmed('read');
    await confirmed('letter');
    await panel
      .locator('[data-application-letter-state="owner-conflict"]')
      .waitFor();
    await tools.locales('language-policy="automatic"', 'submit');
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Language settings overflow phone');
    await panel.screenshot({
      path: 'docs/screenshots/application-language-phone.png',
    });
    values = await owner('draft-values');
    require(values.entries === 0 &&
      values.submissions === 0 &&
      values.resumeChoices ===
        3, 'Read-only recovery replayed a choice or sent');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.letter ===
        'Actual edited owner letter.', 'Language correction lost owner values');
    await action('close').click();
    await tools.state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Language fixture did not drain');
    return {
      initialLanguage: 'ru',
      correctedLanguage: 'en',
      ownerEditsPreserved: true,
      readOnlyRecovery: true,
      locales: 4,
      entryClicks: 0,
      sends: 0,
      browsersClosed: true,
      errors,
    };
  });
