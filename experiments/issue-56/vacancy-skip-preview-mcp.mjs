async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { page, panel, action, state, owner, confirmed, require } = tools;
    const vacancies = page.locator('[data-vacancies]');
    await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
    await vacancies.locator('[data-vacancy-action="search"]').click();
    await vacancies.locator('[data-vacancy-action="collect"]').first().click();
    await panel.locator('[data-application-missing]').waitFor();
    await panel
      .locator('[data-application-option="autoSelectResumeLanguage"]')
      .uncheck();
    await panel.locator('[data-application-option="testMode"]').check();
    await action('start').click();
    await state('ready');
    await owner('refusal', 'POST');
    await confirmed('read');
    await state('external');
    require((await owner('stats')).skips ===
      null, 'Preview persisted a refusal');
    await action('close').click();
    await state('closed');
    const result = [];
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      await page.evaluate(
        (value) =>
          globalThis.localStorage.setItem('metaSovereignLocale', value),
        locale
      );
      await page.reload();
      const skips = vacancies.locator('[data-vacancy-skips="jobs"]');
      await skips.locator('[data-vacancy-skip-empty]').waitFor();
      require(!/vacancySkip\./u.test(
        await skips.innerText()
      ), 'Untranslated skip recovery');
      await skips.screenshot({
        path: `docs/screenshots/issue-56-skip-preview/mcp-${locale}.png`,
      });
      result.push({ locale, emptyAfterReload: true, translated: true });
    }
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Phone overflow');
    await vacancies.locator('[data-vacancy-skips="jobs"]').screenshot({
      path: 'docs/screenshots/issue-56-skip-preview/mcp-phone.png',
    });
    const stats = await owner('stats');
    require(stats.closed &&
      stats.skips === null &&
      stats.clicks === 0 &&
      stats.outcomes.length === 1 &&
      stats.outcomes[0].attempts === 0 &&
      stats.outcomes[0].entries === 0 &&
      stats.errors.length === 0 &&
      tools.errors.length === 0, 'Preview owner did not drain without effects');
    return {
      result,
      previewLedgerUnchanged: true,
      providerEntries: 0,
      providerSubmissions: 0,
      browsersClosed: true,
      phoneFits: true,
      errors: tools.errors,
      liveProvider: false,
    };
  });
