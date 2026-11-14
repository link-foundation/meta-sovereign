async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  if (!form) {
    throw new Error('Supply the isolated form in ?fixture=.');
  }
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${location.origin}/#/forms`);
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('automatic-controls');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  await page.evaluate(() => {
    const api = globalThis.__msApi;
    const prefill = api.formsPrefillReview;
    api.formsPrefillReview = async (input) => {
      const result = await prefill(input);
      globalThis.__prefillMcpReceipt = result;
      return result;
    };
  });
  await page.locator('[data-action="prefill-form"]').click();
  const result = page.locator('[data-form-automatic-result="partial"]');
  await result.waitFor();
  if (
    (await result.locator('[data-form-receipt="applied"]').count()) !== 6 ||
    (await result.locator('[data-form-upload="attached"]').count()) !== 2
  ) {
    throw new Error(
      'Expected six actual field receipts and two verified PDFs.'
    );
  }
  await result
    .getByText('Something only the owner knows', { exact: true })
    .first()
    .waitFor();
  await result
    .locator('[data-form-field]')
    .filter({ hasText: 'Email' })
    .filter({ hasText: 'ada@example.test' })
    .waitFor();
  const proof = await page.evaluate(() => {
    const receipt = globalThis.__prefillMcpReceipt;
    return {
      state: receipt.state,
      receipts: receipt.receipts.length,
      uploads: receipt.uploads.map(({ fieldId, state, file }) => ({
        fieldId,
        state,
        file,
      })),
      nextPage: receipt.nextPage,
      submissionAttempted: receipt.submissionAttempted,
      unresolved: receipt.unresolved,
    };
  });
  for (const [name, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await result.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => globalThis.scrollBy(0, -72));
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > globalThis.innerWidth
      )
    ) {
      throw new Error('Prefill results overflow the viewport.');
    }
    await page.screenshot({
      path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-forms-automatic-controls-mcp-${name}.png`,
    });
  }
  const closing = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/close')
  );
  await page.locator('[data-review-action="close"]').click();
  await closing;
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { ...proof, closed: true };
};
