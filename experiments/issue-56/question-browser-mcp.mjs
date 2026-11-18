async (page) => {
  const base = new URL(page.url()).origin;
  const control = new URL(page.url()).searchParams.get('fixtureControl');
  if (!control || new URL(control).hostname !== '127.0.0.1') {
    throw new Error(
      'Open the private fixture with ?fixtureControl=<loopback URL>.'
    );
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
    globalThis.localStorage.setItem(
      'metaSovereignOperatorScope',
      JSON.stringify({ private: true, bot: true })
    );
  });
  const root =
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-question-browser';
  const stats = async () => (await page.request.get(control)).json();
  const read = async () => {
    const prior = await controls
      .locator('[data-browser-answer-review]')
      .getAttribute('data-browser-answer-review')
      .catch(() => null);
    await controls.locator('[data-browser-answer-inspect]').click();
    await controls
      .locator(
        prior
          ? `[data-browser-answer-review]:not([data-browser-answer-review="${prior}"])`
          : '[data-browser-answer-review]'
      )
      .waitFor();
  };
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.goto(`${base}/#/automation`);
  await page.locator('[data-question-controls] > summary').click();
  const controls = page.locator(
    '[data-question-controls] [data-browser-answer-controls]'
  );
  await controls.locator(':scope > summary').click();
  await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
  // First review is absent; avoid waiting for a nonexistent prior element.
  await controls.locator('[data-browser-answer-inspect]').click();
  await controls.locator('[data-browser-answer-review]').waitFor();
  await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
  await controls
    .locator('[data-browser-answer-select]')
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/mcp-review-desktop.png` });
  await controls.locator('[data-browser-answer-select]').click();
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  if ((await stats()).clicks !== 1) {
    throw new Error('Native selection count mismatch.');
  }
  await page.reload();
  await page.locator('[data-question-controls] > summary').click();
  await controls.locator(':scope > summary').click();
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  if (!(await controls.locator('[data-browser-answer-select]').isDisabled())) {
    throw new Error('Confirmed selection can replay.');
  }
  await page.request.get(`${control}/reset?draft=Keep%20my%20answer`);
  await read();
  if (!(await controls.locator('[data-browser-answer-select]').isDisabled())) {
    throw new Error('Owner draft can be overwritten.');
  }
  if ((await stats()).draft !== 'Keep my answer') {
    throw new Error('Owner draft changed.');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await controls.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/mcp-owner-mobile.png` });
  await page.request.get(`${control}/reset`);
  await read();
  await controls.locator('[data-browser-answer-select]').click();
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  await controls
    .getByRole('button', { name: 'Recover selection status', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/mcp-sent-mobile.png` });
  const final = await stats();
  if (final.clicks !== 1 || final.textSends !== 0 || final.draft !== '') {
    throw new Error('Unexpected provider action.');
  }
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ))
  ) {
    throw new Error('Mobile overflow.');
  }
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }
  return {
    desktopReview: true,
    recoveredWithoutReplay: true,
    ownerDraftProtected: true,
    mobileReceipt: true,
    ...final,
    pageErrors: errors,
    liveProvider: false,
  };
};
