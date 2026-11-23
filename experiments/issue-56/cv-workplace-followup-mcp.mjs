async (page) => {
  const setup = new URL(page.url());
  const control = setup.searchParams.get('control');
  if (!control || new URL(control).hostname !== '127.0.0.1') {
    throw new Error('The owned native fixture is required');
  }
  const { source } = await (await page.request.get(control)).json();
  const native = async (action) => {
    const response = await page.request.post(`${control}/${action}`);
    if (!response.ok()) {
      throw new Error(`Fixture control ${action} failed`);
    }
  };
  const stats = async () => (await page.request.get(control)).json();
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.setViewportSize({ width: 1040, height: 920 });
  await page.goto(`${setup.origin}/#/cv`);
  const panel = page.locator('[data-cv-workplace-review]');
  const watch = page.locator('[data-cv-save-watch]');
  const state = (name) => watch.locator(`[data-cv-watch-state="${name}"]`);
  const action = (name) =>
    panel.locator(`[data-cv-workplace-action="${name}"]`);
  const watchAction = (name) =>
    watch.locator(`[data-cv-watch-action="${name}"]`).click();
  const review = async (name) => {
    await panel.locator('[data-cv-workplace-operation]').selectOption(name);
    await action('loadMembership').click();
    await panel.locator('[data-cv-workplace-membership]').waitFor();
    await action('propose').click();
    await action('approve').click();
    await action('prepare').click();
    await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
  };
  await panel.locator('[data-cv-workplace-export]').selectOption(source);
  await action('loadSource').click();
  await panel.locator('[data-cv-workplace-record]').fill('123');
  await review('copy');
  await watchAction('start');
  await state('watching').waitFor();
  await native('owner-save');
  await state('saved').waitFor();
  const prior = await stats();
  if (
    prior.saves !== 1 ||
    prior.snapshots.some((row) => row.workplace.recordId !== '987')
  ) {
    throw new Error('Expected exact copied record receipt');
  }
  await watchAction('stop');
  await state('stopped').waitFor();
  await native('open-original');
  await review('detach');
  await watchAction('start');
  await state('watching').waitFor();
  await native('owner-save');
  const stale = setup.searchParams.has('stale');
  const outcome = stale ? 'not-saved' : 'saved';
  await state(outcome).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await state(outcome).waitFor();
  await state(outcome).scrollIntoViewIfNeeded();
  const result = await stats();
  const target = result.snapshots.find(
    (row) => row.hash === source.split(':')[1]
  );
  if (
    result.saves !== 2 ||
    result.errors.length ||
    (stale
      ? JSON.stringify(prior.snapshots) !== JSON.stringify(result.snapshots)
      : target?.jobs !== 2 ||
        target?.workplace.recordId !== '123' ||
        target.workplace.checked)
  ) {
    throw new Error(JSON.stringify(result));
  }
  await page.screenshot({
    path: `docs/screenshots/issue-56-cv-workplace-followup/after/mcp-${outcome}-phone.png`,
  });
  await watchAction('stop');
  await state('stopped').waitFor();
  return { outcome, phoneRecovered: true, ...(await stats()) };
};
