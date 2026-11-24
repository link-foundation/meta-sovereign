async (page) => {
  const phase = new URL(page.url()).searchParams.get('phase');
  if (!['before', 'after'].includes(phase)) {
    throw new Error('Choose ?phase=before|after.');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLanguage', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.reload();
  await page.setViewportSize({ width: 1200, height: 900 });
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const preview = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Preview answer', { exact: true }),
  });
  await preview.locator(':scope > summary').click();
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill('What is your preferred deployment region?');
  const response = page.waitForResponse((result) =>
    result.url().endsWith('/api/automations/answers/plan')
  );
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  await response;
  const result = preview.locator('[data-answer-preview]');
  await result.waitFor();
  const text = await result.innerText();
  const indexed = text.includes('Helsinki.');
  if (indexed !== (phase === 'after')) {
    throw new Error(`Unexpected ${phase}: ${text}`);
  }
  if (indexed && !text.includes('Review required')) {
    throw new Error('Derived answer needs review.');
  }
  const root =
    '/tmp/gh-issue-solver-resume-01a1bfa4-bdec-7780-9e26-c4c5ae2e7a00-1794478565459';
  await result.screenshot({
    path: `${root}/docs/screenshots/issue-56-questionnaire-index-${phase}.png`,
  });
  let overflow = null;
  if (indexed) {
    await page.setViewportSize({ width: 390, height: 844 });
    overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > globalThis.innerWidth
    );
    if (overflow) {
      throw new Error('Questionnaire preview overflows phone width.');
    }
    await result.screenshot({
      path: `${root}/docs/screenshots/issue-56-questionnaire-index-mobile.png`,
    });
  }
  if (errors.length) {
    throw new Error(errors.join('; '));
  }
  return { phase, indexed, text, overflow, errors, liveProvider: false };
};
