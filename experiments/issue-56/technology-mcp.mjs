async (originalPage) => {
  const origin = new URL(originalPage.url()).origin;
  await originalPage.goto('about:blank');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let analyses = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/technology-analyze')) {
      analyses++;
    }
  });
  try {
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.setViewportSize({ width: 1180, height: 950 });
    await page.goto(`${origin}/#/cv`);
    const view = page.locator('[data-vacancy-technologies]');
    const action = (name) => view.locator(`[data-technology-action="${name}"]`);
    const field = (name) => view.locator(`[data-technology-field="${name}"]`);
    await field('resume')
      .locator('option')
      .nth(1)
      .waitFor({ state: 'attached' });
    if (!(await action('analyze').isDisabled())) {
      throw new Error('Analysis must require explicit resume selection');
    }
    await field('resume').selectOption({ index: 1 });
    await action('analyze').focus();
    await page.keyboard.press('Enter');
    await view.locator('[data-technology-report]').waitFor();
    const fingerprint = await view
      .locator('[data-technology-report]')
      .getAttribute('data-technology-report');
    if (!(await view.textContent()).includes('React Native')) {
      throw new Error('Distinct technology evidence is missing');
    }
    await view.locator('[data-technology-statistics] > summary').click();
    await view.locator('[data-technology-evidence] > summary').click();
    await view.locator('[data-technology-catalog] > summary').click();
    await field('canonical').fill('Rust');
    await field('aliases').fill('Rustlang');
    await action('entry-save').click();
    if (!(await action('analyze').isDisabled())) {
      throw new Error('Unsaved catalog must block analysis');
    }
    await action('catalog-save').click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-technology-action="analyze"]').disabled
    );
    await page.reload();
    await view.locator(`[data-technology-report="${fingerprint}"]`).waitFor();
    if (!(await action('analyze').isDisabled()) || analyses !== 1) {
      throw new Error(
        'Reload must recover without choosing or analyzing again'
      );
    }
    await view.locator('[data-technology-catalog] > summary').click();
    if (!(await field('entry').textContent()).includes('Rust')) {
      throw new Error('Acknowledged custom alias catalog was lost');
    }
    await view.locator('[data-technology-catalog] > summary').click();
    await view.locator('[data-technology-statistics] > summary').click();
    const directory =
      '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-technologies/after';
    for (const [name, width, height] of [
      ['desktop', 1180, 950],
      ['phone', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await view.evaluate((node) => {
        node.style.scrollMarginTop = '80px';
        node.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > globalThis.innerWidth
        )
      ) {
        throw new Error('Technology controls overflow the viewport');
      }
      await page.screenshot({
        path: `${directory}/technologies-mcp-${name}.png`,
      });
    }
    if (errors.length) {
      throw new Error(JSON.stringify(errors));
    }
    return {
      cases: 4,
      analysisPosts: analyses,
      cachedVacancies: 2,
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
