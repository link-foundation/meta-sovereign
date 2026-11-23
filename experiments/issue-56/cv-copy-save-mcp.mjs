async (page) => {
  const setup = new URL(page.url());
  const control = new URL(setup.searchParams.get('control'));
  if (control.hostname !== '127.0.0.1' || control.protocol !== 'http:') {
    throw new Error('The owned provider fixture is required');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.setViewportSize({ width: 1040, height: 920 });
  await page.goto(`${setup.origin}/#/cv`);
  const view = page.locator('[data-cv-save-watch]');
  const state = (value) =>
    view.locator(`[data-cv-watch-state="${value}"]`).waitFor();
  const action = (value) =>
    view.locator(`[data-cv-watch-action="${value}"]`).click();
  const read = async (path = '/', method = 'GET') => {
    const response = await page.request.fetch(new URL(path, control).href, {
      method,
    });
    if (!response.ok()) {
      throw new Error('Owned fixture control failed');
    }
    return response.json();
  };
  const start = async () => {
    await action('start');
    await state('watching');
  };
  const stop = async () => {
    await action('stop');
    await state('stopped');
  };
  await state('none');
  await start();
  const watchStarted = await read();
  if (
    watchStarted.ownerSaves ||
    watchStarted.records ||
    watchStarted.exports !== 2
  ) {
    throw new Error('Expected two pre-Save export reads and no owner actions');
  }
  await read('/copy', 'POST');
  await state('saved');
  const first = await read();
  if (
    first.snapshots[0].cv.jobs.length !== 2 ||
    first.snapshots[0].workplace.recordId !== '987'
  ) {
    throw new Error('The identical copy did not resolve to the new record');
  }
  await view.locator('[data-cv-saved-snapshot] > summary').first().click();
  await view.scrollIntoViewIfNeeded();
  const path = 'docs/screenshots/issue-56-cv-copy-save/after';
  await page.screenshot({ path: `${path}/mcp-identical-copy-verified.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await state('saved');
  if (JSON.stringify(await read()) !== JSON.stringify(first)) {
    throw new Error('Phone reload repeated verification');
  }
  await view.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${path}/mcp-phone-saved.png` });
  await stop();
  await read('/stale-copy', 'POST');
  await start();
  await read('/copy', 'POST');
  await state('not-saved');
  await view.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${path}/mcp-stale-copy-refused.png` });
  await stop();
  const final = await read();
  if (
    JSON.stringify(final.snapshots) !== JSON.stringify(first.snapshots) ||
    final.ownerSaves !== 2 ||
    final.attachments !== final.detached ||
    final.errors.length ||
    errors.length
  ) {
    throw new Error(
      'Stale export replaced a snapshot or provider work did not drain'
    );
  }
  return {
    newRecord: '987',
    savedTargetJobs: first.snapshots[0].cv.jobs.length,
    preSaveExports: watchStarted.exports,
    staleCopyRefused: true,
    phoneRestored: true,
    ownerSaves: final.ownerSaves,
    attachments: final.attachments,
    detached: final.detached,
    authenticatedProvider: final.authenticatedProvider,
  };
};
