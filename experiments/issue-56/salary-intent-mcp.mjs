async (page) => {
  await page.waitForFunction(() => Boolean(globalThis.__msApi));
  return page.evaluate(async () => {
    const review = await globalThis.__msApi.inspectBrowserAnswer({
      source: 'hh',
      chat: '7',
      salary: {
        enabled: true,
        approved: true,
        defaultCurrency: 'RUB',
        currencies: [
          { code: 'RUB', keywords: ['RUB'], net: 450000, gross: 530000 },
          { code: 'EUR', keywords: ['EUR'], net: 5500, gross: 6500 },
        ],
      },
    });
    if (
      review.plan.text !== 'От 6 500 € в месяц до вычета налогов.' ||
      review.plan.requiresReview
    ) {
      throw new Error('Expected-income request was not resolved');
    }
    const applied = await globalThis.__msApi.prefillBrowserAnswer({
      id: review.id,
    });
    if (!applied.prefilled) {
      throw new Error('Native prefill was not acknowledged');
    }
    return {
      text: review.plan.text,
      basis: review.plan.salary.basis,
      prefilled: true,
    };
  });
};
