async (page) => {
  const form = new URL(page.url()).searchParams.get('fixture');
  if (!form) {
    throw new Error('Supply the isolated pay fixture in ?fixture=.');
  }
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLanguage', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.reload();
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('pay-review');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page.locator('[data-form-field]').first().waitFor();
  await page.locator('[data-form-profile]').selectOption('qa-profile:form-pay');
  await page.locator('[data-action="plan-form"]').click();
  await page.locator('[data-form-plan-summary]').waitFor();
  const cards = page.locator('[data-form-field]');
  const proposals = await cards.allTextContents();
  if (
    !proposals[0].includes('Минимум — 2 000 ₽ в час на руки.') ||
    !proposals[0].includes('Комфортная ставка — 2 700 ₽ в час на руки.') ||
    !proposals[0].includes('Minimum pay source: Form introduction') ||
    !proposals[1].includes('Минимум — 336 000 ₽ в месяц на руки.') ||
    !proposals[2].includes('Owner keeps this pay answer') ||
    !proposals[3].includes('Needs an answer')
  ) {
    throw new Error(
      'Pay source, units, comfortable rate or owner protection failed'
    );
  }
  await cards.first().locator('[data-form-select]').check();
  for (const [name, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await cards
      .first()
      .evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => globalThis.scrollBy(0, -72));
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > globalThis.innerWidth
      )
    ) {
      throw new Error(`Pay review overflows ${name}`);
    }
    await page.screenshot({
      path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-forms-pay-mcp-${name}.png`,
      scale: 'css',
    });
  }
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-application="applied"]').waitFor();
  const receipts = await page.locator('[data-form-receipt="applied"]').count();
  if (receipts !== 1) {
    throw new Error(`Expected one actual pay receipt, got ${receipts}`);
  }
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { proposals, receipts, phoneOverflow: false, reviewClosed: true };
};
