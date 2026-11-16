async (page, applicationPanelBrowser, configureApplicationAnswerContext) => {
  const root =
    '/tmp/gh-issue-solver-resume-01a1bfa4-bdec-7780-9e26-c4c5ae2e7a00-1794478565459';
  const url = new URL(page.url());
  const phase = url.searchParams.get('phase');
  if (!['before', 'after'].includes(phase)) {
    throw new Error(
      'Supply the isolated fixture URL with ?phase=before|after.'
    );
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.setDefaultTimeout(10000);
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.unroute('**/app.min.js');
  if (phase === 'before') {
    await page.route('**/app.min.js', (route) =>
      route.fulfill({
        path: `${root}/ci-logs/application-answer-context-before.min.js`,
        contentType: 'text/javascript',
      })
    );
  }
  const controls = applicationPanelBrowser({ page, base: url.origin });
  const { panel, action } = controls;
  await controls.select();
  if (phase === 'before') {
    if (await panel.locator('[data-application-answer-context]').count()) {
      throw new Error(
        'Published panel unexpectedly exposes shared answer context.'
      );
    }
    await panel.locator('h3').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${root}/docs/screenshots/issue-56-application-context-before.png`,
    });
    return { phase, answerContextControls: false, errors, liveProvider: false };
  }
  await configureApplicationAnswerContext(panel);
  await panel.locator('h3').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${root}/docs/screenshots/issue-56-application-context-settings.png`,
  });
  await action('start').click();
  await panel.locator('[data-application-state="ready"]').waitFor();
  await controls.confirmed('enter');
  const proposal = panel.locator('[data-form-answer="assembled"]').first();
  await proposal.waitFor();
  const text = await proposal.innerText();
  for (const expected of [
    '$6 200',
    '530 000 ₽',
    'owner@example.test',
    'https://github.com/example-owner',
  ]) {
    if (!text.includes(expected)) {
      throw new Error(`Missing component ${expected}: ${text}`);
    }
  }
  await proposal.screenshot({
    path: `${root}/docs/screenshots/issue-56-application-context-after.png`,
  });
  const receipt = panel.locator('[data-application-answer-receipt]');
  if (!(await receipt.innerText()).includes('$6 200')) {
    throw new Error('Frozen targets missing.');
  }
  await controls.phone();
  await proposal.screenshot({
    path: `${root}/docs/screenshots/issue-56-application-context-mobile.png`,
  });
  await action('close').click();
  await panel.locator('[data-application-state="closed"]').waitFor();
  if (errors.length) {
    throw new Error(errors.join('; '));
  }
  return {
    phase,
    answerContextControls: true,
    components: 4,
    phoneOverflow: false,
    nativeReviewClosed: true,
    errors,
    liveProvider: false,
  };
};
