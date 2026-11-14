async (originalPage) => {
  const source = new URL(originalPage.url());
  const control = source.searchParams.get('control');
  await originalPage.goto('about:blank');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stats = async () => (await page.request.get(control)).json();
  const view = page.locator('[data-cv-save-watch]');
  const action = (name) => view.locator(`[data-cv-watch-action="${name}"]`);
  const state = (name) =>
    view.locator(`[data-cv-watch-state="${name}"]`).waitFor();
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  let startPosts = 0;
  let stopPosts = 0;
  page.on('request', (request) => {
    startPosts += Number(
      request.method() === 'POST' && request.url().endsWith('/cv-watch')
    );
    stopPosts += Number(
      request.method() === 'POST' && request.url().endsWith('/cv-watch-stop')
    );
  });
  const directory =
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-cv-save-watch/after';
  try {
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.goto(`${source.origin}/#/cv`);
    await state('none');
    await page.route('**/api/vacancies/cv-watch', async (route) => {
      await route.fetch();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"watch":null}',
      });
    });
    await action('start').click();
    await page.locator('[data-vacancy-error]').waitFor();
    check(
      await action('start').isDisabled(),
      'Uncertain Start must require read-only recovery'
    );
    await page.unroute('**/api/vacancies/cv-watch');
    await action('reload').click();
    await state('watching');
    check(
      startPosts === 1 && (await stats()).attached === 1,
      'Recovery reattached or replayed Start'
    );
    check((await stats()).reads === 0, 'Start performed provider work');
    await page.request.post(`${control}/save`);
    await state('saved');
    await view.locator('[data-cv-saved-snapshot] > summary').click();
    check(
      (await view.textContent()).includes('Independent MCP owner revision'),
      'Final native fields missing'
    );
    check(
      !(await view.textContent()).includes('private@example.test'),
      'Private contact was published'
    );
    await view.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${directory}/cv-save-watch-mcp-desktop.png`,
    });
    await page.route('**/api/vacancies/cv-watch-stop', async (route) => {
      await route.fetch();
      await route.abort('failed');
    });
    await action('stop').click();
    await page.locator('[data-vacancy-error]').waitFor();
    await page.unroute('**/api/vacancies/cv-watch-stop');
    await action('reload').click();
    await state('stopped');
    check(
      stopPosts === 1 && (await stats()).detached === 1,
      'Stop recovery replayed or failed to drain'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await state('stopped');
    await action('start').focus();
    await page.keyboard.press('Tab');
    check(
      await action('reload').evaluate(
        (node) => node === document.activeElement
      ),
      'Disabled Stop disrupted phone keyboard order'
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'Phone layout overflow'
    );
    await page.screenshot({ path: `${directory}/cv-save-watch-mcp-phone.png` });
    check(errors.length === 0, JSON.stringify(errors));
    return {
      cases: 4,
      startPosts,
      stopPosts,
      ...(await stats()),
      errors,
    };
  } finally {
    await context.close();
  }
};
