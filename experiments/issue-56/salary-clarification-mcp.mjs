async (page) => {
  await page.waitForFunction(() => Boolean(globalThis.__msApi));
  const result = await page.evaluate(async () => {
    const salary = {
      enabled: true,
      approved: true,
      defaultCurrency: 'RUB',
      currencies: [
        { code: 'RUB', keywords: ['RUB'], net: 450000, gross: 530000 },
        { code: 'USD', keywords: ['USD'], net: 6000, gross: 7100 },
      ],
    };
    const review = await globalThis.__msApi.inspectBrowserAnswer({
      source: 'hh',
      chat: '7',
      salary,
      recent: ['Ваши зарплатные ожидания в долларах?'],
    });
    const expected = 'От $7 100 в месяц до вычета налогов.';
    if (review.plan.text !== expected || review.plan.requiresReview) {
      throw new Error(
        `Unexpected clarification: ${JSON.stringify(review.plan)}`
      );
    }
    const prepared = await globalThis.__msApi.prefillBrowserAnswer({
      id: review.id,
    });
    return {
      text: review.plan.text,
      currency: review.plan.salary.currency,
      basis: review.plan.salary.basis,
      status: prepared.status,
      prefilled: prepared.prefilled,
      draftExists: (
        await globalThis.__msApi.inspectBrowserAnswer({
          source: 'hh',
          chat: '7',
        })
      ).hasDraft,
    };
  });
  if (!result.prefilled || !result.draftExists) {
    throw new Error('Native draft was not acknowledged');
  }
  return result;
};
