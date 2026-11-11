// Open the real disclosures through their visible summaries, preserving native
// interaction and the exact label shared by question and notice previews.
export const openQuestionPreview = async (page) => {
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const preview = panel.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: /^Preview answer$/u }),
  });
  await preview.locator(':scope > summary').click();
  return { panel, preview };
};
