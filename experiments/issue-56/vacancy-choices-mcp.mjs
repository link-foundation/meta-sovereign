async (originalPage) => {
  const origin = new URL(originalPage.url()).origin;
  await originalPage.goto('about:blank');
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
    await page.goto(`${origin}/#/cv`);
    const panel = page.locator('[data-vacancies]');
    await panel.locator('[data-vacancy-field="query"]').fill('Python');
    await panel
      .locator('[data-vacancy-field="resume"]')
      .fill('selected-resume');
    await panel.locator('[data-vacancy-action="search"]').click();
    const card = panel.locator(
      '[data-vacancy-card="https://hh.ru/vacancy/123"]'
    );
    await card.waitFor();
    await card
      .locator('textarea')
      .fill('Independent browser review: ask about hours.');
    await card.locator('[data-vacancy-choice-action="deferred"]').click();
    const saved = panel.locator('[data-saved-vacancy-choice]');
    await saved.waitFor();
    await saved.locator('[data-vacancy-choice-state="deferred"]').waitFor();
    await page.reload();
    await saved.waitFor();
    check(
      (await saved.locator('textarea').inputValue()).includes(
        'Independent browser'
      ),
      'Restart lost the note'
    );
    await page.route('**/api/vacancies/choice-save', async (route) => {
      await route.fetch();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"ok":true}',
      });
    });
    await saved.locator('[data-vacancy-choice-action="skipped"]').click();
    const choices = panel.locator('[data-vacancy-choices]');
    await choices.getByRole('alert').waitFor();
    check(
      await saved.locator('[data-vacancy-choice-action="clear"]').isDisabled(),
      'Unreceived write remains writable'
    );
    await page.unroute('**/api/vacancies/choice-save');
    await choices.locator('[data-vacancy-choice-action="reload"]').click();
    await saved.locator('[data-vacancy-choice-state="skipped"]').waitFor();
    check(
      (await saved.locator('textarea').inputValue()).includes(
        'Independent browser'
      ),
      'Reload lost private notes'
    );
    for (const [name, width, height] of [
      ['mcp-desktop', 1180, 950],
      ['mcp-phone', 390, 950],
    ]) {
      await page.setViewportSize({ width, height });
      await saved.scrollIntoViewIfNeeded();
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        'Viewport overflow'
      );
      await page.screenshot({
        path: `docs/screenshots/issue-56-vacancy-choices/after/${name}.png`,
      });
    }
    await saved.locator('[data-vacancy-choice-action="clear"]').click();
    await saved.waitFor({ state: 'detached' });
    check(errors.length === 0, 'Unexpected page error');
    return {
      restored: true,
      lostReplyRecovered: true,
      locales: 'independent English UI',
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
