/** Share owned UI setup and closure; each inspection checks its own plan. */
export const inspectSalaryFormReview = async (page, unused, inspect) => {
  const initial = new URL(page.url());
  const before = initial.searchParams.get('before') === '1';
  const fixture = new URL(initial.searchParams.get('fixture'));
  fixture.pathname = '/salary-options';
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${initial.origin}/#/forms`);
  await page.locator('[data-form-url]').fill(fixture.href);
  await page.locator('[data-form-slot]').fill('salary-options-mcp');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page.locator('[data-form-field]').first().waitFor();
  const result = await page.evaluate(inspect, before);
  const closing = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/close')
  );
  await page.locator('[data-review-action="close"]').click();
  await closing;
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { ...result, closed: true };
};
