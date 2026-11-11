async (page) => {
  const url = new URL(page.url());
  const base = url.origin;
  const control = url.searchParams.get('fixtureControl');
  if (!control || new URL(control).hostname !== '127.0.0.1') {
    throw new Error('Open the private fixture with its loopback control URL.');
  }
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
  await page.goto(`${base}/#/automation`);
  await page.locator('[data-question-controls] > summary').click();
  const controls = page.locator(
    '[data-question-controls] [data-browser-answer-controls]'
  );
  await controls.locator(':scope > summary').click();
  await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
  const read = async () => {
    const previous = await controls
      .locator('[data-browser-answer-review]')
      .getAttribute('data-browser-answer-review')
      .catch(() => null);
    await controls.locator('[data-browser-answer-inspect]').click();
    await controls
      .locator(
        previous
          ? `[data-browser-answer-review]:not([data-browser-answer-review="${previous}"])`
          : '[data-browser-answer-review]'
      )
      .waitFor();
  };
  const seed = async () => {
    await page.request.get(`${control}/reset`);
    await page.request.get(`${control}/pending`);
    await read();
  };
  await seed();
  const turn = controls.locator(
    '[data-browser-answer-review] [data-browser-pending-turn]'
  );
  if ((await turn.locator('li').count()) !== 2) {
    throw new Error('Earlier pending message missing.');
  }
  await turn
    .getByText('What is your expected salary?', { exact: true })
    .waitFor();
  await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
  await controls.scrollIntoViewIfNeeded();
  const root =
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-pending-turn';
  await page.screenshot({ path: `${root}/pending-turn-mcp-desktop.png` });
  await page.request.get(`${control}/pending-edit`);
  await controls.locator('[data-browser-answer-select]').click();
  await controls.locator('[data-browser-answer-status="failed"]').waitFor();
  const refused = await (await page.request.get(control)).json();
  if (refused.clicks !== 0 || refused.textSends !== 0 || refused.draft !== '') {
    throw new Error('Stale context reached provider.');
  }
  await seed();
  await page.setViewportSize({ width: 390, height: 900 });
  await turn
    .getByText('What is your expected salary?', { exact: true })
    .waitFor();
  await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
  await controls.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/pending-turn-mcp-mobile.png` });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ))
  ) {
    throw new Error('Mobile overflow.');
  }
  await controls.locator('[data-browser-answer-select]').click();
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  await controls
    .getByRole('button', { name: 'Recover selection status', exact: true })
    .click();
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  const final = await (await page.request.get(control)).json();
  if (final.clicks !== 1 || final.textSends !== 0 || errors.length) {
    throw new Error('Unexpected provider action or page error.');
  }
  return {
    pendingMessages: 2,
    staleContextRefused: true,
    recoveredWithoutReplay: true,
    mobileWidth: 390,
    ...final,
    pageErrors: errors,
    liveProvider: false,
  };
};
