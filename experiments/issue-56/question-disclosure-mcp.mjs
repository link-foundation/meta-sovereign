async (page) => {
  const base = 'http://127.0.0.1:37347';
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.setViewportSize({ width: 1180, height: 950 });
  const url = `${base}/?disclosure-check=mcp#/automation`;
  await page.goto(url);
  const openQuestionPreview = async () => {
    const panel = page.locator('[data-question-controls]');
    const preview = panel.locator('details').filter({
      has: page.locator(':scope > summary', { hasText: /^Preview answer$/u }),
    });
    for (const section of [panel, preview]) {
      if ((await section.getAttribute('open')) === null) {
        await section.locator(':scope > summary').click();
      }
    }
    return { panel, preview };
  };
  const { panel, preview } = await openQuestionPreview();
  const question = preview.getByLabel('Question or pattern', { exact: true });
  const draft = 'Keep this unsaved question while reopening the preview.';
  await question.fill(draft);
  const previous = await page.evaluateHandle(() => globalThis.document);
  await page.goto(url);
  if (!(await previous.evaluate((node) => node === globalThis.document))) {
    throw new Error('The document was unexpectedly replaced.');
  }
  // Reproduce the old unconditional click on the actual retained document.
  await panel.locator(':scope > summary').click();
  if (await panel.evaluate((node) => node.open)) {
    throw new Error(
      'The old opening action did not reproduce the closed root.'
    );
  }
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-ci-question-disclosure/mcp-before.png',
  });
  await openQuestionPreview();
  await openQuestionPreview();
  if (
    !(await question.isVisible()) ||
    (await question.inputValue()) !== draft
  ) {
    throw new Error('Repeated opening lost the draft or hid its control.');
  }
  await question.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-ci-question-disclosure/mcp-after.png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.app-shell-compact').waitFor();
  await preview.locator(':scope > summary').click();
  await openQuestionPreview();
  await question.scrollIntoViewIfNeeded();
  if (
    (await question.inputValue()) !== draft ||
    (await page.evaluate(
      () => document.documentElement.scrollWidth > globalThis.innerWidth
    ))
  ) {
    throw new Error('Phone reopening lost the draft or overflowed.');
  }
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-ci-question-disclosure/mcp-phone-after.png',
  });
  await previous.dispose();
  if (errors.length) {
    throw new Error(errors.join('; '));
  }
  return {
    sameDocument: true,
    oldActionClosesRoot: true,
    repeatedOpeningPreservesDraft: true,
    phoneNestedOpening: true,
    errors,
  };
};
