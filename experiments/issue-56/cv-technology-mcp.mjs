async (originalPage) => {
  const origin = new URL(originalPage.url()).origin;
  await originalPage.goto('about:blank');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  const errors = [];
  const check = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };
  let generationPosts = 0;
  let savePosts = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    generationPosts += Number(request.url().endsWith('/technology-review'));
    savePosts += Number(request.url().endsWith('/technology-review-save'));
  });
  try {
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.goto(`${origin}/#/cv`);
    const view = page.locator('[data-cv-technology-review]');
    const action = (name) =>
      view.locator(`[data-cv-technology-action="${name}"]`);
    await view
      .locator('[data-cv-technology-export="en"] option')
      .nth(1)
      .waitFor({ state: 'attached' });
    check(
      await action('generate').isDisabled(),
      'Explicit language exports must be required'
    );
    for (const language of ['ru', 'en']) {
      await view
        .locator(`[data-cv-technology-export="${language}"]`)
        .selectOption({ index: 1 });
    }
    await action('generate').focus();
    await page.keyboard.press('Enter');
    await view.locator('[data-cv-technology-plan]').waitFor();
    check(
      (await view.textContent()).includes(
        'Keep this final narrative unchanged'
      ),
      'Job narrative was lost'
    );
    await view.locator('[data-cv-technology-raw] > summary').click();
    check(
      (await view.locator('[data-cv-technology-raw]').textContent()).includes(
        'Duplicates: 1'
      ),
      'Raw duplicate evidence missing'
    );
    const selected = view.locator('[data-cv-technology-select="en:about"]');
    await selected.focus();
    await page.keyboard.press('Space');
    await action('save').click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-cv-technology-plan]')
        ?.textContent.includes('Provider CV unchanged')
    );
    const saved = await view
      .locator('[data-cv-technology-plan]')
      .getAttribute('data-cv-technology-plan');
    await page.reload();
    await view.locator(`[data-cv-technology-plan="${saved}"]`).waitFor();
    check(await selected.isChecked(), 'Acknowledged selected change was lost');
    check(
      await action('generate').isDisabled(),
      'Reload silently selected source exports'
    );
    await page.route('**/api/vacancies/technology-review', async (route) => {
      await route.fetch();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ review: null }),
      });
    });
    for (const language of ['ru', 'en']) {
      await view
        .locator(`[data-cv-technology-export="${language}"]`)
        .selectOption({ index: 1 });
    }
    await action('generate').click();
    await page.locator('[data-vacancy-error]').waitFor();
    check(
      (await view
        .locator('[data-cv-technology-plan]')
        .getAttribute('data-cv-technology-plan')) === saved,
      'Malformed acknowledgement replaced the current review'
    );
    await page.unroute('**/api/vacancies/technology-review');
    await action('reload').click();
    await page.waitForFunction(
      (old) =>
        document
          .querySelector('[data-cv-technology-plan]')
          ?.getAttribute('data-cv-technology-plan') !== old,
      saved
    );
    check(
      await action('save').isDisabled(),
      'Recovered draft silently selected changes'
    );
    const directory =
      '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-cv-technologies/after';
    for (const [name, width, height] of [
      ['desktop', 1180, 950],
      ['phone', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await view.evaluate((node) => {
        node.style.scrollMarginTop = '80px';
        node.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        'CV review overflows the viewport'
      );
      await page.screenshot({
        path: `${directory}/cv-technologies-mcp-${name}.png`,
      });
    }
    await view.locator('[data-cv-technology-export="en"]').focus();
    await page.keyboard.press('Tab');
    check(
      await action('generate').evaluate(
        (node) => node === document.activeElement
      ),
      'Phone keyboard order lost'
    );
    check(
      generationPosts === 2 && savePosts === 1 && errors.length === 0,
      JSON.stringify({ generationPosts, savePosts, errors })
    );
    return { cases: 4, generationPosts, savePosts, pageErrors: errors };
  } finally {
    await context.close();
  }
};
