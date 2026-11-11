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
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-summary-choice/after';
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
  await controls
    .getByText('Accepted answer summary', { exact: true })
    .waitFor();
  if (
    !(await controls
      .getByRole('radio', { name: 'Yes', exact: true })
      .isChecked())
  ) {
    throw new Error('Accepted summary option was not selected.');
  }
  await controls.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/mcp-summary-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await controls.scrollIntoViewIfNeeded();
  await controls.locator('[data-browser-answer-select]').click();
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  await page.screenshot({ path: `${root}/mcp-summary-sent-mobile.png` });
  const receipt = await stats();
  if (receipt.clicks !== 1 || receipt.textSends !== 0 || receipt.draft !== '') {
    throw new Error('Unexpected provider action.');
  }
  await page.request.get(`${control}/reset`);
  await page.request.get(`${control}/summary?answer=conflict`);
  await read();
  await controls.locator('[data-answer-summary-state="conflict"]').waitFor();
  if (await controls.getByRole('radio', { checked: true }).count()) {
    throw new Error('Conflicting summary selected an option.');
  }
  if (!(await controls.locator('[data-browser-answer-select]').isDisabled())) {
    throw new Error('Conflicting summary enabled automatic selection.');
  }
  const final = await stats();
  if (final.clicks !== 0 || final.textSends !== 0 || final.draft !== '') {
    throw new Error('Conflict caused a provider action.');
  }
  await page.screenshot({ path: `${root}/mcp-summary-conflict-mobile.png` });
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
    acceptedSummary: true,
    conflictProtected: true,
    mobileReceipt: true,
    ...final,
    pageErrors: errors,
    liveProvider: false,
  };
};
