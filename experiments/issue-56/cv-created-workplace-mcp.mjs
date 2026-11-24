async (page, { base, control }) => {
  const require = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.localStorage.setItem('metaSovereignTutorial', '{"off":true,"v":5}');
    if (!window.localStorage.getItem('metaSovereignLocale')) {
      window.localStorage.setItem('metaSovereignLocale', 'en');
    }
  });
  await page.goto(`${base}/#/cv`);
  const view = page.locator('[data-cv-save-watch]');
  const state = (value) =>
    view.locator(`[data-cv-watch-state="${value}"]`).waitFor();
  const action = (value) =>
    view.locator(`[data-cv-watch-action="${value}"]`).click();
  const owner = async (path = '/', method = 'GET') => {
    const response = await page.request.fetch(`${control}${path}`, { method });
    require(response.ok(), 'Owned fixture control failed');
    return response.json();
  };
  await state('none');
  await action('start');
  await state('watching');
  let stats = await owner();
  require(stats.lists === 1 &&
    stats.ownerSaves === 0 &&
    stats.records === 0, 'Watcher performed an owner action');
  await owner('/save', 'POST');
  await state('saved');
  const previous = (await owner()).snapshots;
  require(previous.length === 2 &&
    previous[0].workplace.recordId === '987' &&
    previous[1].workplace.checked ===
      false, 'Exact saved new identity was not confirmed');
  require(previous[0].cv.jobs[0].description ===
    'Independent MCP owner-created workplace', 'Final owner description changed');
  const directory = 'docs/screenshots/issue-56-cv-created-workplace';
  if (await page.locator('[data-tutorial-overlay]').count()) {
    await page.keyboard.press('Escape');
    await page
      .locator('[data-tutorial-overlay]')
      .waitFor({ state: 'detached' });
  }
  await view.screenshot({ path: `${directory}/mcp-after.png` });
  const locales = [];
  for (const locale of ['ru', 'hi', 'zh', 'en']) {
    await page.evaluate(
      (value) => window.localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.reload();
    await state('saved');
    require(!/cvWatch\./u.test(
      await view.innerText()
    ), 'Untranslated Save state');
    locales.push(locale);
  }
  stats = await owner();
  require(stats.ownerSaves === 1 &&
    stats.lists === 2 &&
    stats.records === 1, 'Reload repeated provider work');
  await page.setViewportSize({ width: 390, height: 1200 });
  require(await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  ), 'Phone layout overflow');
  await view.screenshot({ path: `${directory}/mcp-phone.png` });
  await action('stop');
  await state('stopped');
  await owner('/mismatch', 'POST');
  await action('start');
  await state('watching');
  await owner('/save', 'POST');
  await state('not-saved');
  await action('stop');
  await state('stopped');
  stats = await owner();
  require(JSON.stringify(stats.snapshots) ===
    JSON.stringify(previous), 'Mismatch replaced verified snapshots');
  require(stats.ownerSaves === 2 &&
    stats.attachments === stats.detached &&
    errors.length === 0 &&
    stats.errors.length === 0, 'Owned work did not drain');
  return {
    newIdentityVerified: true,
    mismatchRetainsSnapshots: true,
    reloadDoesNotReplay: true,
    phoneFits: true,
    locales,
    errors,
    ownerSaves: stats.ownerSaves,
    attachments: stats.attachments,
    detached: stats.detached,
    authenticatedProvider: false,
  };
};
