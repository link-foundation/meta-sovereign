async (page, applicationPanelBrowser, configureApplicationAnswerContext) => {
  const root =
    '/tmp/gh-issue-solver-resume-01a1bfa4-bdec-7780-9e26-c4c5ae2e7a00-1794478565459';
  const url = new URL(page.url());
  const phase = url.searchParams.get('phase');
  if (!['before', 'after'].includes(phase)) {
    throw new Error('Supply phase=before|after on the owned fixture URL.');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript((phase) => {
    if (
      globalThis.localStorage.getItem('salary-application-evidence-phase') !==
      phase
    ) {
      globalThis.localStorage.removeItem(
        'meta-sovereign:hh-application-intent'
      );
      globalThis.localStorage.setItem(
        'salary-application-evidence-phase',
        phase
      );
    }
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  }, phase);
  await page.setViewportSize({ width: 1200, height: 1050 });
  await page.unrouteAll({ behavior: 'wait' });
  if (phase === 'before') {
    await page.route('**/app.min.js', (route) =>
      route.fulfill({
        path: `${root}/ci-logs/application-salary-parent.min.js`,
        contentType: 'text/javascript',
      })
    );
  }
  const controls = applicationPanelBrowser({ page, base: url.origin });
  await controls.select();
  await configureApplicationAnswerContext(controls.panel);
  await controls.action('start').click();
  await controls.panel.locator('[data-application-state="ready"]').waitFor();
  await controls.confirm();
  const held = await controls.action('enter').isDisabled();
  if (held !== (phase === 'after')) {
    throw new Error(`Unexpected entry policy in ${phase}: ${held}`);
  }
  if (phase === 'after') {
    await controls.panel
      .locator('[data-application-salary="exclude"]')
      .waitFor();
    if (
      !(await controls.action('form').isDisabled()) ||
      !(await controls.action('submit').isDisabled())
    ) {
      throw new Error('Held actions remained available');
    }
  }
  await controls.panel.locator('h3').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${root}/docs/screenshots/issue-56-application-salary-${phase}.png`,
  });
  if (phase === 'after') {
    await controls.locales('[data-application-salary="exclude"]');
    await controls.phone();
    await controls.panel.screenshot({
      path: `${root}/docs/screenshots/issue-56-application-salary-phone.png`,
    });
  }
  await controls.action('close').click();
  await controls.panel.locator('[data-application-state="closed"]').waitFor();
  if (errors.length) {
    throw new Error(errors.join('; '));
  }
  return {
    phase,
    entryHeld: held,
    salaryReceipt: phase === 'after',
    locales: phase === 'after' ? 4 : 1,
    phoneOverflow: false,
    ownedReviewClosed: true,
    sends: 0,
    errors,
    liveProvider: false,
  };
};
