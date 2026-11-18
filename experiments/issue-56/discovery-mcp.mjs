async (originalPage, fixture) =>
  fixture(originalPage, async ({ page, owner, require, errors }) => {
    const panel = page.locator('[data-vacancies]');
    const discovery = panel.locator('[data-vacancy-discovery]');
    const complete = discovery.locator('[data-discovery-phase="completed"]');
    await panel.locator('[data-vacancy-field="query"]').fill('Python');
    await discovery.locator('[data-discovery-action="start"]').click();
    // Four real native readers exceed the shared single-action 10 s fixture wait.
    await complete.waitFor({ timeout: 45000 });
    require((await discovery.locator('[data-discovery-card]').count()) ===
      3, 'Missing discovered cards');
    require(/Pages visited: 2/u.test(
      await complete.innerText()
    ), 'Missing native pagination');
    const baseline = await owner('stats');
    require(baseline.opens === 4 &&
      baseline.closed &&
      baseline.providerClicks === 0, 'Native reads did not drain');
    await complete.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/vacancy-discovery-after-mcp.png',
    });
    await page.reload();
    await complete.waitFor();
    const batch = panel.locator('[data-application-batch]');
    await batch
      .locator('[data-application-batch-action="use-discovery"]')
      .click();
    require((await batch
      .locator('[data-application-batch-field="urls"]')
      .inputValue()) ===
      'https://hh.ru/vacancy/123\nhttps://hh.ru/vacancy/125', 'Batch draft copied wrong URLs');
    require(await batch
      .locator('[data-application-batch-action="start"]')
      .isDisabled(), 'Copy armed an application batch');
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (locale) =>
          globalThis.localStorage.setItem('metaSovereignLocale', locale),
        locale
      );
      await page.reload();
      await complete.waitFor();
      require(!/\bdiscovery\.[a-z]/u.test(
        await discovery.innerText()
      ), 'Untranslated discovery control');
    }
    await page.setViewportSize({ width: 390, height: 1100 });
    await complete.scrollIntoViewIfNeeded();
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Phone overflow');
    await page.screenshot({
      path: 'docs/screenshots/vacancy-discovery-phone-mcp.png',
    });
    const stats = await owner('stats');
    require(stats.opens === baseline.opens &&
      stats.closed &&
      stats.providerClicks === 0 &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Recovery replayed work or leaked resources');
    return {
      pages: 2,
      vacancies: 3,
      descriptions: 2,
      providerClicks: 0,
      batchStarted: false,
      recoveryReplayed: false,
      locales: 4,
      phone: true,
      resourcesClosed: true,
      errors,
    };
  });
