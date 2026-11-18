async (originalPage) => {
  const source = new URL(originalPage.url());
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const require = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
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
    const panel = page.locator('[data-vacancies]');
    const terms = panel.locator('[data-vacancy-field="excludeText"]');
    const first = panel.locator(
      '[data-vacancy-card="https://hh.ru/vacancy/123"]'
    );
    const second = panel.locator(
      '[data-vacancy-card="https://hh.ru/vacancy/124"]'
    );
    const search = panel.locator('[data-vacancy-action="search"]');
    await panel.locator('[data-vacancy-field="query"]').fill('Python');
    await terms.fill('Python engineer 123');
    await search.click();
    await first.locator('[data-vacancy-selection="configured-text"]').waitFor();
    await second.locator('[data-vacancy-selection="responded"]').waitFor();
    require((await panel.locator('[data-vacancy-card]').count()) ===
      2, 'Selection hid a native card');
    await first.locator('textarea').fill('Independent saved review question.');
    await first.locator('[data-vacancy-choice-action="deferred"]').click();
    await panel.locator('[data-saved-vacancy-choice]').waitFor();
    await panel.locator('[data-vacancy-selection-summary="stale"]').waitFor();
    require((await first.locator('[data-vacancy-selection]').count()) ===
      0, 'Old owner decision remained current');
    await search.click();
    await first.locator('[data-vacancy-selection="owner-deferred"]').waitFor();
    for (const [name, width] of [
      ['mcp-desktop', 1180],
      ['mcp-phone', 390],
    ]) {
      await page.setViewportSize({ width, height: 950 });
      await panel
        .locator('[data-vacancy-selection-summary]')
        .scrollIntoViewIfNeeded();
      require(await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ), 'Horizontal overflow');
      await page.screenshot({
        path: `docs/screenshots/issue-56-vacancy-selection/${name}.png`,
      });
    }
    await page.reload();
    await terms.waitFor();
    require((await terms.inputValue()) ===
      'Python engineer 123', 'Search exclusions did not persist');
    await terms.fill('');
    await panel.locator('[data-vacancy-field="skipResponded"]').uncheck();
    await search.click();
    await second.locator('[data-vacancy-selection="review"]').waitFor();
    await first.locator('[data-vacancy-selection="owner-deferred"]').waitFor();
    const stats = await (
      await context.request.get(source.searchParams.get('fixture-control'))
    ).json();
    require(stats.closed &&
      stats.providerClicks === 0 &&
      errors.length === 0, 'Unexpected provider or browser activity');
    return {
      nativeReasons: true,
      staleChoice: true,
      persistentSettings: true,
      reversibleFilters: true,
      providerClicks: 0,
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
