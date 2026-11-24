async (page) => {
  const query = new URL(page.url()).searchParams;
  const phase = query.get('phase');
  const form = query.get('form');
  if (!['before', 'after'].includes(phase) || !form) {
    throw new Error('Supply ?phase=before|after&form=<isolated form URL>.');
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
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-action="read-form"]').click();
  const cards = page.locator('[data-form-field]');
  const card = cards.first();
  await card.waitFor();
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:questionnaire');
  await page.locator('[data-action="plan-form"]').click();
  await page.locator('[data-form-plan-summary]').waitFor();
  const text = await card.innerText();
  const hasSalary = text.includes('$6 000 net per month.');
  if (
    hasSalary !== (phase === 'after') ||
    !text.includes('owner@example.test')
  ) {
    throw new Error(`Unexpected ${phase} proposal: ${text}`);
  }
  if (
    phase === 'after' &&
    !(await cards.allTextContents()).every(
      (value) =>
        value.includes('$6 000 net per month.') &&
        /(?:^|\s)https:\/\/github\.com\/example-owner(?=$|\s)/u.test(value)
    )
  ) {
    throw new Error(
      'Literal and br questionnaires must retain every component.'
    );
  }
  const root =
    '/tmp/gh-issue-solver-resume-01a1bfa4-bdec-7780-9e26-c4c5ae2e7a00-1794478565459';
  await card.screenshot({
    path: `${root}/docs/screenshots/issue-56-form-questionnaire-${phase}.png`,
  });
  let phoneOverflow = null;
  if (phase === 'after') {
    await page.setViewportSize({ width: 390, height: 844 });
    phoneOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > globalThis.innerWidth
    );
    if (phoneOverflow) {
      throw new Error('Questionnaire report overflows phone width.');
    }
    await card.screenshot({
      path: `${root}/docs/screenshots/issue-56-form-questionnaire-mobile.png`,
    });
  }
  if (errors.length) {
    throw new Error(`Page errors: ${errors.join('; ')}`);
  }
  return { phase, hasSalary, text, phoneOverflow, errors, liveProvider: false };
};
