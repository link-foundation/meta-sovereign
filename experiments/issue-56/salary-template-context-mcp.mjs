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
          { code: 'USD', keywords: ['USD'], net: 6000, gross: 7100 },
          { code: 'EUR', keywords: ['EUR'], net: 5500, gross: 6500 },
        ],
      },
    });
    if (
      review.plan.text !== 'I expect 5 500 €, negotiable.' ||
      review.plan.requiresReview ||
      review.plan.salaryTemplates.fields[0].currency !== 'EUR'
    ) {
      throw new Error(
        'Personal salary template did not follow the requested currency'
      );
    }
    const applied = await globalThis.__msApi.prefillBrowserAnswer({
      id: review.id,
    });
    if (!applied.prefilled) {
      throw new Error('Native prefill was not acknowledged');
    }
    return {
      text: review.plan.text,
      currency: review.plan.salaryTemplates.fields[0].currency,
      prefilled: true,
    };
  });
};
