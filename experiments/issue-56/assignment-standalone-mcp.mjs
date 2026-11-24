async (page) => {
  const location = new URL(page.url());
  const instructions =
    'Design the stock reconciliation process. Include a three-page proposal describing stale warehouse records and recovery.';
  const target = 'fixture-owner/reviewed-task';
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
  await page.goto(`${location.origin}/#/forms`);
  const panel = page.locator('[data-standalone-assignment]');
  const text = panel.getByLabel('Assignment instructions', { exact: true });
  const publish = panel.locator('[data-action="publish-assignment"]');
  const evidence = panel.getByText('Instructions used: pasted text', {
    exact: false,
  });
  const enterTarget = async () => {
    await panel.locator('summary').click();
    await panel.getByLabel('GitHub owner/repository').fill(target);
  };
  await enterTarget();
  await text.fill(instructions);
  await panel.locator('[data-action="draft-assignment"]').click();
  await evidence.waitFor();
  const review = await evidence.textContent();
  await text.fill('Different instructions.');
  await publish.waitFor({ state: 'detached' });
  await page.reload();
  await enterTarget();
  await panel.locator('[data-action="restore-assignment"]').click();
  await evidence.waitFor();
  const restored = (await text.inputValue()) === instructions;
  const width = await page.evaluate(() => ({
    viewport: globalThis.innerWidth,
    content: globalThis.document.documentElement.scrollWidth,
  }));
  const result = { review, restored, width, errors, publications };
  if (
    !restored ||
    width.content > width.viewport ||
    errors.length ||
    publications.length
  ) {
    throw new Error(JSON.stringify(result));
  }
  await evidence.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  return result;
};
