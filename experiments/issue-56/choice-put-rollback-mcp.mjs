async (originalPage) => {
  const source = new URL(originalPage.url());
  const control = source.searchParams.get('fixture-control');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const check = (value, message) => {
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
    await panel.locator('[data-vacancy-field="query"]').fill('Python');
    await panel.locator('[data-vacancy-action="search"]').click();
    const card = panel.locator(
      '[data-vacancy-card="https://hh.ru/vacancy/123"]'
    );
    await card
      .locator('textarea')
      .fill('Independent acknowledged review note.');
    await card.locator('[data-vacancy-choice-action="deferred"]').click();
    const saved = panel.locator('[data-saved-vacancy-choice]');
    await saved.locator('[data-vacancy-choice-state="deferred"]').waitFor();
    const arm = await context.request.post(`${control}/fail-next`);
    check(arm.ok(), 'Fixture refusal could not be armed');
    await saved.locator('textarea').fill('Uncommitted replacement from MCP.');
    await saved.locator('[data-vacancy-choice-action="skipped"]').click();
    await panel.locator('[data-vacancy-choices] [role="alert"]').waitFor();
    check(
      await saved.locator('[data-vacancy-choice-action="clear"]').isDisabled(),
      'Failed write remained writable'
    );
    await page.reload();
    await saved.waitFor();
    check(
      (await saved
        .locator('[data-vacancy-choice-state]')
        .getAttribute('data-vacancy-choice-state')) === 'deferred',
      'Reload exposed an unacknowledged exclusion'
    );
    check(
      (await saved.locator('textarea').inputValue()) ===
        'Independent acknowledged review note.',
      'Acknowledged note was replaced'
    );
    for (const [name, width] of [
      ['mcp-desktop', 1180],
      ['mcp-phone', 390],
    ]) {
      await page.setViewportSize({ width, height: 950 });
      await saved.scrollIntoViewIfNeeded();
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        'Viewport overflow'
      );
      await page.screenshot({
        path: `docs/screenshots/issue-56-choice-put-rollback/${name}.png`,
      });
    }
    const response = await context.request.get(control);
    const stats = await response.json();
    check(
      stats.failedSaves === 1 && stats.providerClicks === 0 && stats.closed,
      'Unexpected fixture operations'
    );
    check(errors.length === 0, 'Unexpected browser error');
    return {
      reloadPreserved: true,
      failedSaves: stats.failedSaves,
      providerClicks: stats.providerClicks,
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
