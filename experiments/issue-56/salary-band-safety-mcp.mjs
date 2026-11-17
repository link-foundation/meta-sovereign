async (page, input) => {
  await page.waitForFunction(() => Boolean(globalThis.__msApi));
  const result = await page.evaluate(async (request) => {
    const review = await globalThis.__msApi.inspectBrowserAnswer(request);
    return {
      text: review.plan.text,
      complete: review.plan.complete,
      requiresReview: review.plan.requiresReview,
      options: review.answerOptions,
    };
  }, input);
  const before = result.text === 'USD 5001–8000';
  if (
    (before && (!result.complete || result.requiresReview)) ||
    (!before &&
      (result.text !== '' || result.complete || !result.requiresReview)) ||
    JSON.stringify(result.options) !==
      JSON.stringify(['USD 0–5000', 'USD 5001–8000'])
  ) {
    throw new Error(
      `Unexpected native salary review: ${JSON.stringify(result)}`
    );
  }
  return { ...result, before, inspectionOnly: true };
};
