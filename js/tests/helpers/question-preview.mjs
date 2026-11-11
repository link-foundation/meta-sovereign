// Identical fragment URLs can retain the document and native disclosure state.
// Open through a visible summary only when needed; never toggle an open section.
export const openQuestionDisclosure = async (disclosure) => {
  if (!(await disclosure.evaluate((node) => node.open))) {
    await disclosure.locator(':scope > summary').click();
  }
};

export const openQuestionPreview = async (page) => {
  const panel = page.locator('[data-question-controls]');
  await openQuestionDisclosure(panel);
  const preview = panel.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: /^Preview answer$/u }),
  });
  await openQuestionDisclosure(preview);
  return { panel, preview };
};
