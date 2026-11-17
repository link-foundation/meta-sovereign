async (page) => {
  const initial = new URL(page.url());
  const before = initial.searchParams.get('before') === '1';
  const intervalProbe = initial.searchParams.has('intervalProbe');
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
  const result = await page.evaluate(
    async ({ before }) => {
      const api = globalThis.__msApi;
      const session = (await api.formsReviews()).sessions.find(
        (item) => item.browserSlot === 'salary-options-mcp'
      );
      const salary = {
        enabled: true,
        approved: true,
        defaultCurrency: 'USD',
        currencies: [
          { code: 'USD', keywords: ['USD'], net: 6000, gross: 7100 },
        ],
      };
      const plan = await api.formsPlanReview({ id: session.id, salary });
      const both = plan.fields.find((field) => field.name === 'both');
      const ambiguous = plan.fields.find((field) => field.name === 'ambiguous');
      const nearest = plan.fields.find(
        (field) => field.name === 'nearest' && field.answer.proposal?.checked
      );
      if (
        both?.answer.text !== 'USD 5000–8000' ||
        nearest?.answer.text !== 'USD 6500–8000' ||
        !nearest.answer.reuseRequiresReview
      ) {
        throw new Error(`Unexpected salary plan: ${JSON.stringify(plan)}`);
      }
      const checkAlternative = (field) => {
        if (before) {
          if (!field?.answer.proposal) {
            throw new Error(
              'The parent did not propose the numeric alternative'
            );
          }
        } else if (
          field?.answer.proposal !== null ||
          field.answer.complete ||
          !field.answer.requiresReview
        ) {
          throw new Error(`Unexpected alternative: ${JSON.stringify(field)}`);
        }
      };
      checkAlternative(ambiguous);
      const input = {
        id: session.id,
        planId: plan.reviewPlan.id,
        fields: before ? [ambiguous.id] : [both.id, nearest.id],
      };
      const applied = await api.formsApplyReview(input);
      const recovered = await api.formsApplyReview(input);
      if (
        applied.state !== 'applied' ||
        applied.receipts.length !== (before ? 1 : 2) ||
        !applied.receipts.every((item) => item.status === 'applied') ||
        JSON.stringify(recovered.receipts) !== JSON.stringify(applied.receipts)
      ) {
        throw new Error(
          `Unexpected native readback: ${JSON.stringify(applied)}`
        );
      }
      return {
        both: both.answer.text,
        nearest: nearest.answer.text,
        receipts: applied.receipts.length,
        recovered: true,
        nearestRequiresReview: true,
      };
    },
    { before }
  );
  const read = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/read')
  );
  await page.locator('[data-review-action="read"]').click();
  await read;
  await page.locator('[data-form-field]').first().scrollIntoViewIfNeeded();
  if (!intervalProbe) {
    await page.screenshot({
      path: 'docs/screenshots/issue-56-salary-options-mcp.png',
      fullPage: true,
    });
  }
  const closing = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/close')
  );
  await page.locator('[data-review-action="close"]').click();
  await closing;
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  if (intervalProbe) {
    return {
      before,
      ambiguousHeld: !before,
      receipts: result.receipts,
      recovered: result.recovered,
      closed: true,
    };
  }
  return { ...result, closed: true };
};
