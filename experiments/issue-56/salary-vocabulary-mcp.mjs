async (page) => {
  await page.waitForFunction(() => Boolean(globalThis.__msApi));
  const result = await page.evaluate(async () => {
    const review = await globalThis.__msApi.inspectBrowserAnswer({
      source: 'hh',
      chat: '7',
      salary: {
        enabled: true,
        approved: true,
        defaultCurrency: 'EUR',
        currencies: [
          { code: 'EUR', keywords: ['EUR'], net: 5500, gross: 6500 },
        ],
      },
    });
    if (
      review.plan.text !== 'From 6 500 € gross per month.' ||
      review.plan.requiresReview
    ) {
      throw new Error('Learned salary vocabulary was not applied');
    }
    const applied = await globalThis.__msApi.prefillBrowserAnswer({
      id: review.id,
    });
    return {
      text: review.plan.text,
      basis: review.plan.salary.basis,
      prefilled: applied.prefilled,
    };
  });
  if (!result.prefilled) {
    throw new Error('Native prefill was not acknowledged');
  }
  return result;
};
