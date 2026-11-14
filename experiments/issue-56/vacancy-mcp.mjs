async (page) => {
  const origin = new URL(page.url()).origin;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${origin}/#/cv`);
  const panel = page.locator('[data-vacancies]');
  const action = (name) => panel.locator(`[data-vacancy-action="${name}"]`);
  const field = (key) => panel.locator(`[data-vacancy-field="${key}"]`);
  await panel.waitFor();
  await field('resume').fill('mcp-selected');
  await field('query').fill('Python');
  await field('mode').selectOption('headless');
  await action('search').click();
  await panel.locator('[data-vacancy-card]').first().waitFor();
  if ((await panel.locator('[data-vacancy-card]').count()) !== 2) {
    throw new Error('The exact first result page is missing.');
  }
  await field('query').fill('Changed');
  if (!(await action('next').isDisabled())) {
    throw new Error('Changed filters must require a new search.');
  }
  await field('query').fill('Python');
  await action('collect').first().click();
  const snapshot = panel.locator('[data-vacancy-snapshot]');
  await snapshot.waitFor();
  const prose = await snapshot.locator('pre').innerText();
  if (!prose.includes('Employer’s final paragraph stays intact.')) {
    throw new Error('Complete employer prose was lost.');
  }
  const directory =
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-vacancies/after';
  for (const [name, width] of [
    ['desktop', 1180],
    ['phone', 390],
  ]) {
    await page.setViewportSize({ width, height: 950 });
    await snapshot.scrollIntoViewIfNeeded();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > globalThis.innerWidth
      )
    ) {
      throw new Error('Vacancy controls overflow the viewport.');
    }
    await page.screenshot({ path: `${directory}/vacancies-mcp-${name}.png` });
  }
  await page.reload();
  await panel
    .getByRole('button', { name: 'Python engineer', exact: true })
    .click();
  await snapshot.waitFor();
  if (
    (await field('resume').inputValue()) !== 'mcp-selected' ||
    (await snapshot.locator('pre').innerText()) !== prose
  ) {
    throw new Error('Cached prose or saved settings were not recovered.');
  }
  if (errors.length) {
    throw new Error(JSON.stringify(errors));
  }
  return {
    cases: 3,
    savedResume: 'mcp-selected',
    completeProse: true,
    pageErrors: errors,
  };
};
