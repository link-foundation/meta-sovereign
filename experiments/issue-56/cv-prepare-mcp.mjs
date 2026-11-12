async (originalPage) => {
  const source = new URL(originalPage.url());
  const control = source.searchParams.get('control');
  await originalPage.goto('about:blank');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let posts = 0;
  page.on('request', (request) => {
    posts += Number(
      request.method() === 'POST' && request.url().endsWith('/cv-prepare')
    );
  });
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const panel = page.locator('[data-cv-preparation]');
  const prepare = panel.locator('[data-cv-prepare-change="en:about"]');
  const reload = panel.locator('[data-cv-prepare-reload]');
  const state = (name) =>
    panel.locator(`[data-cv-preparation-state="${name}"]`).waitFor();
  const directory =
    source.searchParams.get('screenshots') ??
    'docs/screenshots/issue-56-cv-prepare/after';
  try {
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.goto(`${source.origin}/#/cv`);
    await prepare.waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-cv-prepare-change="en:about"]')
          ?.disabled === false
    );
    await page.route('**/api/vacancies/cv-prepare', async (route) => {
      await route.fetch();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"preparation":null}',
      });
    });
    await prepare.click();
    await page.locator('[data-vacancy-error]').waitFor();
    check(await prepare.isDisabled(), 'Malformed reply must block preparation');
    await page.unroute('**/api/vacancies/cv-prepare');
    await reload.click();
    await state('prepared');
    check(posts === 1, 'GET recovery replayed preparation');
    check(
      (await panel.textContent()).includes('does not confirm a provider save'),
      'Prepared draft was presented as a provider save'
    );
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/cv-prepare-mcp-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await state('prepared');
    await prepare.focus();
    await page.keyboard.press('Tab');
    check(
      await reload.evaluate((node) => node === document.activeElement),
      'Preparation keyboard order changed'
    );
    await page.keyboard.press('Enter');
    await state('prepared');
    check(posts === 1, 'Reload replayed preparation');
    check(
      await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      'Phone panel overflows'
    );
    await page.screenshot({ path: `${directory}/cv-prepare-mcp-phone.png` });
    await page.route('**/api/vacancies/cv-prepare', (route) =>
      route.abort('failed')
    );
    await prepare.click();
    await page.locator('[data-vacancy-error]').waitFor();
    await page.unroute('**/api/vacancies/cv-prepare');
    await reload.click();
    await page.waitForFunction(
      () => !document.querySelector('[data-cv-preparation-state]')
    );
    check(
      await prepare.isDisabled(),
      'GET-null permitted a replacement request'
    );
    await page.reload();
    await panel.waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-cv-prepare-reload]')?.disabled === false
    );
    check(await prepare.isDisabled(), 'Reload forgot an unreceived intent');
    check(errors.length === 0, JSON.stringify(errors));
    return {
      cases: 4,
      posts,
      ...(await (await page.request.get(control)).json()),
      errors,
    };
  } finally {
    await context.close();
  }
};
