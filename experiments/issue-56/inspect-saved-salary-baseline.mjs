/** Independent real-UI inspection against the owned salary radio fixture. */
export const inspectSavedSalaryBaseline = async (page) => {
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
  const result = await page.evaluate(async (before) => {
    const api = globalThis.__msApi;
    const session = (await api.formsReviews()).sessions.find(
      (item) => item.browserSlot === 'salary-options-mcp'
    );
    const plan = await api.formsPlanReview({ id: session.id });
    const selected = plan.fields.filter(
      (field) =>
        field.name === 'savedBaseline' && field.answer.proposal?.checked
    );
    if (selected.length !== (before ? 0 : 1)) {
      throw new Error('Unexpected saved baseline proposal count');
    }
    if (before) {
      return { baseline: true, before, receipts: 0, configuredSalary: false };
    }
    const field = selected[0];
    if (
      field.answer.salary?.amount !== 450000 ||
      !field.answer.requiresReview ||
      field.answer.salary.baseline?.source !== 'saved-answer'
    ) {
      throw new Error('Unexpected saved baseline evidence');
    }
    const input = {
      id: session.id,
      planId: plan.reviewPlan.id,
      fields: [field.id],
    };
    const applied = await api.formsApplyReview(input);
    const recovered = await api.formsApplyReview(input);
    if (
      applied.state !== 'applied' ||
      applied.receipts.length !== 1 ||
      applied.receipts[0].status !== 'applied' ||
      JSON.stringify(recovered.receipts) !== JSON.stringify(applied.receipts)
    ) {
      throw new Error('Saved baseline readback failed');
    }
    return {
      baseline: true,
      before,
      receipts: 1,
      recovered: true,
      configuredSalary: false,
    };
  }, before);
  const closing = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/close')
  );
  await page.locator('[data-review-action="close"]').click();
  await closing;
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { ...result, closed: true };
};
