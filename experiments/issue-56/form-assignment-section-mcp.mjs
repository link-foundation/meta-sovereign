async (page) => {
  const url = new URL(page.url());
  const fixture = url.searchParams.get('fixture');
  if (!fixture) {
    throw new Error('Open the isolated Forms fixture first.');
  }
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${url.origin}/#/forms`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-form-url]').fill(fixture);
  await page.locator('[data-form-slot]').fill('assignment-section-mcp');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  await page.locator('[data-action="plan-form"]').click();
  const hold = page.locator(
    '[data-form-assignment] [data-form-assignment-state="needs-repository"]'
  );
  await hold.waitFor();
  const fitsPhone = await page.evaluate(
    () => document.documentElement.scrollWidth <= globalThis.innerWidth
  );
  if (!fitsPhone) {
    throw new Error('The Forms review does not fit at phone width.');
  }
  const message = await hold.innerText();
  await page.locator('[data-action="prefill-form"]').click();
  await page.locator('[data-form-automatic-result="refused"]').waitFor();
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { fitsPhone, message, prefillRefused: true, reviewClosed: true };
};
