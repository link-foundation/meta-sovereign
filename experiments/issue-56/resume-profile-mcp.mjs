async (page) => {
  await page.evaluate(() =>
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    )
  );
  await page.reload();
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const preview = panel.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: 'Preview answer' }),
  });
  await preview.locator(':scope > summary').click();
  const fields = preview.locator(':scope > [data-answer-profile]');
  const importer = fields.locator(':scope > [data-profile-import]');
  await importer.locator(':scope > summary').click();
  await importer
    .getByRole('button', { name: 'Load saved CVs', exact: true })
    .click();
  await importer.getByText('Saved CVs loaded.', { exact: true }).waitFor();
  await importer
    .getByLabel('Saved CV snapshot', { exact: true })
    .selectOption('cv:resume-import');
  await importer
    .getByRole('button', { name: 'Preview profile fields', exact: true })
    .click();
  const draft = importer.locator('[data-profile-draft]');
  await draft.waitFor();
  const cvChoices = await draft
    .getByRole('checkbox')
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute('aria-label')));
  if (
    !cvChoices.some((value) => value === 'birthDate: 1990-03-02') ||
    !cvChoices.some((value) =>
      value.startsWith('github: https://github.com/synthetic-owner')
    )
  ) {
    throw new Error('CV contacts missing');
  }
  await importer
    .getByLabel('Saved CV snapshot', { exact: true })
    .selectOption('');
  await importer
    .getByLabel('Contact text format', { exact: true })
    .selectOption('resume-markdown');
  await importer
    .getByLabel('Your contact details', { exact: true })
    .fill(
      '# Example Alex\n\n**First name:** Alex\n**Last name:** Example\nМужчина, 36 лет, родился 2 марта 1990\nПроживает: Hanoi\n+1 (555) 555-0123\n[owner@example.test](mailto:owner@example.test)\nTelegram: [@synthetic_owner](https://t.me/synthetic_owner)\nGitHub: [Personal](https://github.com/synthetic-owner), [Team](https://github.com/synthetic-team)\nРезюме: [HH](https://hh.ru/resume/synthetic-owner)\n\n## Опыт работы\nEmployer contact: company@example.test\n[Employer](https://github.com/employer-example)'
    );
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/automations/answers/profile') &&
      response.request().method() === 'POST'
  );
  await importer
    .getByRole('button', { name: 'Preview profile fields', exact: true })
    .click();
  const status = (await response).status();
  await draft.waitFor();
  const initiallySelected = await draft.locator('input:checked').count();
  const boxes = await draft.getByRole('checkbox').all();
  if (boxes.length !== 10 || initiallySelected !== 0) {
    throw new Error('Unexpected extracted or selected fields');
  }
  for (const box of boxes) {
    await box.check();
  }
  await page.setViewportSize({ width: 1200, height: 900 });
  await draft
    .locator('fieldset')
    .last()
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-resume-profile-mcp-desktop.png',
    scale: 'css',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () =>
      globalThis.document.documentElement.scrollWidth <=
      globalThis.innerWidth + 1
  );
  await draft
    .locator('fieldset')
    .last()
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-resume-profile-mcp-mobile.png',
    scale: 'css',
  });
  await importer
    .getByRole('button', { name: 'Use selected fields', exact: true })
    .click();
  await importer
    .getByText(
      'Selected fields added to this draft. Save the draft to retain them.',
      { exact: true }
    )
    .waitFor();
  const values = fields.locator(':scope > [data-profile-values]');
  const selected = {};
  for (const key of [
    'name',
    'firstName',
    'lastName',
    'birthDate',
    'location',
    'phone',
    'email',
    'telegram',
    'github',
    'resume',
  ]) {
    selected[key] = await values.getByLabel(key, { exact: true }).inputValue();
  }
  if (
    selected.birthDate !== '1990-03-02' ||
    selected.github !==
      'https://github.com/synthetic-owner\nhttps://github.com/synthetic-team'
  ) {
    throw new Error('Selected contacts changed');
  }
  return {
    status,
    cvChoices,
    initiallySelected,
    selected,
    mobileOverflow: false,
  };
};
