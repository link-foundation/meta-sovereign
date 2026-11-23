async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  if (!form) {
    throw new Error('Supply the disposable form URL in ?fixture=.');
  }
  const errors = [];
  const actions = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const action = new URL(request.url()).pathname.match(
      /^\/api\/forms\/assignment\/(draft|restore|publish)$/u
    )?.[1];
    if (action) {
      actions.push(action);
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
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('assignment-active-mcp');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  await page.locator('[data-action="plan-form"]').click();
  const control = page.locator('[data-assignment-publisher]');
  const target = control.getByLabel('GitHub owner/repository');
  await target.fill('fixture-owner/reviewed-task');
  await control.locator('[data-action="draft-assignment"]').click();
  const draft = control.locator('[data-assignment-draft]');
  await draft.waitFor();
  const id = await draft.getAttribute('data-assignment-draft');
  await target.fill('fixture-owner/other-task');
  await draft.waitFor({ state: 'detached' });
  await control.locator('[data-action="restore-assignment"]').click();
  await draft.waitFor();
  const restored = await draft.getAttribute('data-assignment-draft');
  const width = await page.evaluate(() => ({
    viewport: globalThis.innerWidth,
    content: globalThis.document.documentElement.scrollWidth,
  }));
  const result = { id, restored, actions, width, errors };
  if (
    !id?.startsWith('assignment-draft:') ||
    restored !== id ||
    (await target.inputValue()) !== 'fixture-owner/reviewed-task' ||
    actions.join(',') !== 'draft,restore' ||
    width.content > width.viewport ||
    errors.length
  ) {
    throw new Error(JSON.stringify(result));
  }
  await draft.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  return result;
};
