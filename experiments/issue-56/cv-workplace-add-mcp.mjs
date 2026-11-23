async (page) => {
  const setup = new URL(page.url());
  const control = setup.searchParams.get('control');
  const source = setup.searchParams.get('source');
  if (!control || !source) {
    throw new Error('Missing local fixture parameters');
  }
  const read = async () => (await page.request.get(control)).json();
  const root = 'docs/screenshots/issue-56-cv-workplace-add/after';
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`${setup.origin}/#/cv`);
  const panel = page.locator('[data-cv-workplace-review]');
  const action = (name) =>
    panel.locator(`[data-cv-workplace-action="${name}"]`);
  const field = (name) => panel.locator(`[data-cv-workplace-field="${name}"]`);
  await panel.locator('[data-cv-workplace-operation]').selectOption('add');
  await panel.locator('[data-cv-workplace-export]').selectOption(source);
  await action('loadAddSource').click();
  await field('company').waitFor();
  if (
    await panel
      .locator('[data-cv-workplace-record],[data-cv-workplace-job]')
      .count()
  ) {
    throw new Error('Add requires existing workplace identity');
  }
  const fields = {
    company: 'Northstar Systems',
    position: 'Platform Engineer',
    description: 'Built reliable workflows.\nDocumented incident response.',
    start: '2019-03',
    end: '2024-08',
    website: 'https://northstar.example.org',
  };
  for (const [key, value] of Object.entries(fields)) {
    await field(key).fill(value);
  }
  await field('areaId').selectOption('2');
  await panel.locator('[data-cv-workplace-industry="7.540"]').check();
  await panel
    .locator('[data-cv-workplace-operation]')
    .evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${root}/new-workplace-fields.png` });
  await action('propose').click();
  const draft = panel.locator('[data-cv-workplace-plan="draft"]');
  await draft.waitFor();
  await draft.screenshot({ path: `${root}/target-only-review.png` });
  await action('approve').click();
  await panel.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
  await action('prepare').click();
  const receipt = panel.locator('[data-cv-preparation-state="prepared"]');
  await receipt.waitFor();
  const before = await read();
  if (before.saves !== 0 || before.attached !== 1 || before.detached !== 1) {
    throw new Error('Preparation did not stop before the native owner Save');
  }
  const watch = page.locator('[data-cv-save-watch]');
  const watchAction = (name) =>
    watch.locator(`[data-cv-watch-action="${name}"]`);
  const watchState = (name) => watch.locator(`[data-cv-watch-state="${name}"]`);
  await watchAction('start').click();
  await watchState('watching').waitFor();
  if (!(await page.request.post(`${control}/owner-save`)).ok()) {
    throw new Error('The native owner Save fixture failed');
  }
  await watchState('saved').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await receipt.waitFor();
  await watchState('saved').waitFor();
  await receipt.screenshot({ path: `${root}/prepared-phone.png` });
  await watch.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/verified-owner-save-phone.png` });
  await watchAction('stop').click();
  await watchState('stopped').waitFor();
  const after = await read();
  if (
    after.saves !== 1 ||
    after.attached !== after.detached ||
    after.errors.length
  ) {
    throw new Error('Expected one native Save and drained browser attachments');
  }
  return { before, after };
};
