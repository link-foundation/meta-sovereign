async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/#/cv`);
  const panel = page.locator('[data-vacancies]');
  await panel.locator('[data-vacancy-field="query"]').fill('Python');
  await panel.locator('[data-vacancy-action="search"]').click();
  await panel.locator('[data-vacancy-card]').first().waitFor();
  await panel.locator('[data-vacancy-action="collect"]').first().click();
  const snapshot = panel.locator('[data-vacancy-snapshot]');
  await snapshot.waitFor();
  const retained = await snapshot.innerText();
  for (const required of [
    'от 320 000 ₽ до вычета налогов',
    'Hybrid by agreement',
    '16 November 2026',
    'Python · SQL',
    'Final employer paragraph.',
  ]) {
    if (!retained.includes(required)) {
      throw new Error(`Missing metadata: ${required}`);
    }
  }
  await page.reload();
  await panel
    .getByRole('button', { name: 'Python engineer', exact: true })
    .click();
  await snapshot.waitFor();
  if ((await snapshot.innerText()) !== retained) {
    throw new Error('Cache recovery changed metadata');
  }
  const directory =
    '/tmp/gh-issue-solver-resume-01a1bfa4-bdec-7780-9e26-c4c5ae2e7a00-1794478565459/docs/screenshots/issue-56-vacancy-metadata/after';
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
      throw new Error('Metadata overflows the viewport');
    }
    await page.screenshot({ path: `${directory}/mcp-${name}.png` });
  }
  if (errors.length) {
    throw new Error(JSON.stringify(errors));
  }
  return {
    modernMetadata: true,
    cacheRecovered: true,
    widths: [1180, 390],
    pageErrors: errors,
    liveProvider: false,
  };
};
