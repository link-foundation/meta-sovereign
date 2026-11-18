async (page) => {
  const location = new URL(page.url());
  const fixture = new URL(location.searchParams.get('fixture'));
  fixture.searchParams.set('page', '2');
  await page.addInitScript(() => {
    for (const [key, value] of [
      ['metaSovereignLocale', 'en'],
      ['metaSovereignTutorial', '{"off":true,"v":5}'],
    ]) {
      globalThis.localStorage.setItem(key, value);
    }
  });
  await page.goto(`${location.origin}/#/forms`);
  await page.locator('[data-form-url]').fill(fixture.href);
  await page.locator('[data-form-slot]').fill('period-review');
  await page.evaluate(async () =>
    globalThis.__msApi.saveAnswerRule({
      id: 'language',
      question: 'Preferred language',
      answers: [
        { text: 'English', count: 4, approved: true },
        { text: 'English.', count: 1, approved: true },
      ],
    })
  );
  await page.locator('[data-action="open-form-review"]').click();
  const control = (action) => page.locator(`[data-review-action="${action}"]`);
  const field = page
    .locator('[data-form-field]')
    .filter({ hasText: 'Preferred language' });
  const readField = async () => {
    await control('read').click();
    await field.waitFor();
  };
  await readField();
  const result = await page.evaluate(async () => {
    const api = globalThis.__msApi;
    const session = (await api.formsReviews()).sessions.find(
      (item) => item.browserSlot === 'period-review'
    );
    const input = {
      id: session.id,
      requestId: 'mcp-period',
      answerFinalPeriod: 'without',
    };
    const plan = await api.formsPlanReview(input);
    if (!plan.ok) {
      throw new Error(`Plan refused: ${JSON.stringify(plan)}`);
    }
    const first = await api.formsPrefillReview(input);
    if (!first.ok) {
      throw new Error(`Prefill refused: ${JSON.stringify(first)}`);
    }
    const recovered = await api.formsPrefillReview(input);
    const refused = await api.formsPrefillReview({
      ...input,
      answerFinalPeriod: 'with',
    });
    if (
      plan.fields[0].answer.text !== 'English' ||
      plan.fields[0].answer.count !== 5 ||
      first.receipts[0].status !== 'applied' ||
      first.submissionAttempted ||
      JSON.stringify(recovered.receipts) !== JSON.stringify(first.receipts) ||
      refused.code !== 'form-prefill-conflict'
    ) {
      throw new Error(
        `Unexpected form period result: ${JSON.stringify({ plan, first, recovered, refused })}`
      );
    }
    return {
      answer: plan.fields[0].answer.text,
      count: plan.fields[0].answer.count,
      receipt: first.receipts[0].status,
      recovered: true,
      changedPreference: refused.code,
      submissionAttempted: first.submissionAttempted,
    };
  });
  await readField();
  await field.filter({ hasText: 'English' }).waitFor();
  const closing = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/sessions/close')
  );
  await control('close').click();
  await closing;
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { ...result, closed: true };
};
