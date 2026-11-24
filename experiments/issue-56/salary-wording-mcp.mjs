async (page) => {
  await page.waitForFunction(() => Boolean(globalThis.__msApi));
  const result = await page.evaluate(async () => {
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
      review.plan.text !== 'От 5 500 € ежемесячно на руки.' ||
      review.plan.requiresReview
    ) {
      throw new Error(`Unexpected wording: ${JSON.stringify(review.plan)}`);
    }
    const prepared = await globalThis.__msApi.prefillBrowserAnswer({
      id: review.id,
    });
    return {
      text: review.plan.text,
      rules: review.plan.rules,
      prefilled: prepared.prefilled,
    };
  });
  if (!result.prefilled || result.rules[0] !== 'qa-rule:salary-wording') {
    throw new Error('Owner wording was not acknowledged');
  }
  return result;
};
