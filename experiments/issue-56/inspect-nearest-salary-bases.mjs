/** Inspect one owned salary plan through the default UI API. */
export const inspectNearestSalaryBases = async (before) => {
  const api = globalThis.__msApi;
  const session = (await api.formsReviews()).sessions.find(
    (item) => item.browserSlot === 'salary-options-mcp'
  );
  const plan = await api.formsPlanReview({
    id: session.id,
    salary: {
      enabled: true,
      approved: true,
      defaultCurrency: 'USD',
      currencies: [{ code: 'USD', keywords: ['USD'], net: 3500, gross: 4500 }],
    },
  });
  const field = plan.fields.find((field) => field.name === 'both');
  if (field.answer.complete !== !before || !field.answer.requiresReview) {
    throw new Error('Dual-basis nearest review state mismatch');
  }
  if (before) {
    return { before, receipts: 0, automatic: false };
  }
  if (
    field.answer.salary.option.contained ||
    !field.answer.reuseRequiresReview
  ) {
    throw new Error('Nearest salary band lost required review');
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
    JSON.stringify(applied.receipts) !== JSON.stringify(recovered.receipts)
  ) {
    throw new Error('Nearest salary native readback or recovery failed');
  }
  return { before, receipts: 1, recovered: true, automatic: false };
};
