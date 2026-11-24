async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  if (!form) {
    throw new Error('Supply the isolated form in ?fixture=.');
  }
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLanguage', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${location.origin}/#/forms`);
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('automatic-review');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  const session = await page.evaluate(async () =>
    (await globalThis.__msApi.formsReviews()).sessions.find(
      (item) => item.browserSlot === 'automatic-review'
    )
  );
  const prefill = () =>
    page.evaluate((input) => globalThis.__msApi.formsPrefillReview(input), {
      id: session.id,
      requestId: 'mcp-automatic',
      profileId: 'qa-profile:forms-fixture',
    });
  const result = await prefill();
  if (
    result.state !== 'partial' ||
    result.receipts.length !== 6 ||
    result.uploads.length !== 2 ||
    result.uploads.some((item) => item.state !== 'attached') ||
    !result.nextPage ||
    result.submissionAttempted
  ) {
    throw new Error(`Unexpected prefill receipt: ${JSON.stringify(result)}`);
  }
  const recovered = await prefill();
  if (JSON.stringify(recovered.receipts) !== JSON.stringify(result.receipts)) {
    throw new Error('Receipt recovery changed writes.');
  }
  await page.locator('[data-review-action="read"]').click();
  await page
    .locator('[data-form-field]')
    .filter({ hasText: 'Email' })
    .filter({ hasText: 'ada@example.test' })
    .waitFor();
  for (const [name, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const field = page
      .locator('[data-form-field]')
      .filter({ hasText: 'Email' })
      .first();
    await field.scrollIntoViewIfNeeded();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > globalThis.innerWidth
      )
    ) {
      throw new Error('Report overflows viewport.');
    }
    await page.screenshot({
      path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-forms-automatic-mcp-${name}.png`,
    });
  }
  const closing = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/close')
  );
  await page.locator('[data-review-action="close"]').click();
  await closing;
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return {
    state: result.state,
    receipts: result.receipts.length,
    uploads: result.uploads.map(({ fieldId, state, file }) => ({
      fieldId,
      state,
      file,
    })),
    unresolved: result.unresolved,
    nextPage: result.nextPage,
    closed: true,
  };
};
