async (page) => {
  const { origin } = new URL(page.url());
  const id = '12345678901234567890';
  const url = `https://hh.ru/vacancy/${id}`;
  const errors = [];
  const publications = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().endsWith('/api/forms/assignment/publish')) {
      publications.push(request.method());
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${origin}/#/forms`);
  const panel = page.locator('[data-standalone-assignment]');
  const enterTarget = async () => {
    await panel.locator('summary').click();
    await panel
      .getByLabel('GitHub owner/repository')
      .fill('fixture-owner/reviewed-task');
  };
  await enterTarget();
  await panel
    .getByLabel('Assignment instructions', { exact: true })
    .fill(
      'Design a reconciliation tool for stock receipts with a short proposal describing the approach.'
    );
  const vacancy = panel.getByLabel('HH vacancy URL or ID (optional)', {
    exact: true,
  });
  await vacancy.fill(id);
  const valid = await vacancy.evaluate((node) => node.validity.valid);
  await panel.locator('[data-action="draft-assignment"]').click();
  const evidence = panel.locator(`[data-assignment-draft] a[href="${url}"]`);
  await evidence.waitFor();
  const reviewed = await evidence.textContent();
  await vacancy.fill('123');
  await panel
    .locator('[data-action="publish-assignment"]')
    .waitFor({ state: 'detached' });
  await page.reload();
  await enterTarget();
  await panel.locator('[data-action="restore-assignment"]').click();
  await evidence.waitFor();
  const restored = await vacancy.inputValue();
  const width = await page.evaluate(() => ({
    viewport: globalThis.innerWidth,
    content: globalThis.document.documentElement.scrollWidth,
  }));
  const result = { valid, reviewed, restored, width, errors, publications };
  if (
    !valid ||
    !reviewed.includes('Python engineer') ||
    restored !== url ||
    width.content > width.viewport ||
    errors.length ||
    publications.length
  ) {
    throw new Error(JSON.stringify(result));
  }
  await evidence.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  return result;
};
