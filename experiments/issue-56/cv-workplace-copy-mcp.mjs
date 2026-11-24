async (page) => {
  const setup = new URL(page.url());
  const control = setup.searchParams.get('control');
  const before = setup.searchParams.get('phase') === 'before';
  if (!control || new URL(control).hostname !== '127.0.0.1') {
    throw new Error('The owned native fixture is required');
  }
  const stats = async () => (await page.request.get(control)).json();
  const { source } = await stats();
  const root = 'docs/screenshots/issue-56-cv-workplace-copy';
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.setViewportSize({ width: 1040, height: 920 });
  await page.goto(`${setup.origin}/#/cv`);
  const panel = page.locator('[data-cv-workplace-review]');
  const operation = panel.locator('[data-cv-workplace-operation]');
  const action = (name) =>
    panel.locator(`[data-cv-workplace-action="${name}"]`);
  await panel.locator('[data-cv-workplace-export]').selectOption(source);
  await action('loadSource').click();
  await panel.locator('[data-cv-workplace-record]').fill('123');
  if (before) {
    const options = await operation
      .locator('option')
      .evaluateAll((nodes) => nodes.map((node) => node.value));
    if (options.includes('copy')) {
      throw new Error('Expected the published bundle without copy');
    }
    await operation.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${root}/before/mcp-shared-workplace-before.png`,
    });
    return { options };
  }
  await operation.selectOption('copy');
  await action('loadMembership').click();
  await panel.locator('[data-cv-workplace-membership]').waitFor();
  await panel
    .locator('[data-cv-workplace-field="description"]')
    .fill('Reviewed English copy for this CV.');
  await action('propose').click();
  await action('approve').click();
  await panel.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
  await action('prepare').click();
  const prepared = panel.locator('[data-cv-preparation-state="prepared"]');
  await prepared.waitFor();
  await panel
    .locator('[data-cv-workplace-change="resumes"]')
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/after/mcp-shared-copy-review.png` });
  const first = await stats();
  if (
    first.saves !== 0 ||
    first.reads !== 2 ||
    first.attached !== 2 ||
    first.attached !== first.detached ||
    first.errors.length
  ) {
    throw new Error(JSON.stringify(first));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await prepared.waitFor();
  await prepared.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/after/mcp-shared-copy-phone.png` });
  const recovered = await stats();
  if (JSON.stringify(first) !== JSON.stringify(recovered)) {
    throw new Error('Phone reload changed native counters');
  }
  return recovered;
};
