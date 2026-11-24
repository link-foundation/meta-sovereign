async (page) => {
  await page.waitForFunction(() => Boolean(globalThis.__msApi));
  return page.evaluate(async () => {
    const review = await globalThis.__msApi.inspectBrowserAnswer({
      source: 'hh',
      chat: '7',
      salary: {
        enabled: true,
        approved: true,
        currencies: [
          { code: 'USD', keywords: ['USD', '$'], net: 6000, gross: 7100 },
          {
            code: 'USDT',
            keywords: ['USDT', 'blockchain'],
            net: 6200,
            gross: 7300,
            contextPriority: 10,
          },
        ],
      },
      vacancy: {
        description:
          'Lead Blockchain Engineer / Architect, from USD 5 000 per month',
      },
    });
    if (
      review.plan.text !== 'From 6 200 USDT net per month.' ||
      review.plan.requiresReview ||
      review.plan.salary.currency !== 'USDT'
    ) {
      throw new Error('Configured context priority was not applied');
    }
    const applied = await globalThis.__msApi.prefillBrowserAnswer({
      id: review.id,
    });
    if (!applied.prefilled) {
      throw new Error('Native prefill was not acknowledged');
    }
    return {
      text: review.plan.text,
      currency: review.plan.salary.currency,
      prefilled: true,
    };
  });
};
