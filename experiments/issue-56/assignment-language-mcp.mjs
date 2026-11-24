async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  if (!form) {
    throw new Error('Supply the disposable form URL in ?fixture=.');
  }
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
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('assignment-language-mcp');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  await page.locator('[data-action="plan-form"]').click();
  const control = page.locator('[data-assignment-publisher]');
  const language = control.getByLabel('Template language');
  await language.waitFor();
  const automatic = await language.inputValue();
  await control
    .getByLabel('GitHub owner/repository')
    .fill('fixture-owner/reviewed-task');
  await language.selectOption('python');
  await control.locator('[data-action="draft-assignment"]').click();
  const review = control.locator('[data-assignment-language]');
  await review.waitFor();
  const reviewed = await review.textContent();
  await language.selectOption('typescript');
  await review.waitFor({ state: 'detached' });
  await control.locator('[data-action="restore-assignment"]').click();
  await review.waitFor();
  const restored = await language.inputValue();
  const width = await page.evaluate(() => ({
    viewport: globalThis.innerWidth,
    content: globalThis.document.documentElement.scrollWidth,
  }));
  if (
    automatic !== '' ||
    reviewed !== 'Selected by you: Python' ||
    restored !== 'python' ||
    width.content > width.viewport ||
    errors.length ||
    publications.length
  ) {
    throw new Error(
      JSON.stringify({
        automatic,
        reviewed,
        restored,
        width,
        errors,
        publications,
      })
    );
  }
  await review.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  return { automatic, reviewed, restored, width, errors, publications };
};
