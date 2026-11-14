async (page) => {
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
    globalThis.metaSovereignDebug = true;
  });
  await page.reload();
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const editor = panel.locator('[data-answer-rule]');
  await editor.getByLabel('Question or pattern', { exact: true }).fill('City?');
  const answer = editor.getByLabel('Answer', { exact: true });
  await answer.fill('Original answer');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByText('Answer rule saved.', { exact: true }).waitFor();
  await page.route('**/api/automations/answers/save', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'text/lino',
      body: '(error "Answer fixture refusal" status "failed")',
    })
  );
  await answer.fill('Keep my unsaved edit');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'Answer operation was not confirmed.' })
    .waitFor();
  if ((await answer.inputValue()) !== 'Keep my unsaved edit') {
    throw new Error('Refused save discarded the edit');
  }
  await answer.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-answer-ack-after.png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await answer.scrollIntoViewIfNeeded();
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > globalThis.innerWidth
    )
  ) {
    throw new Error('Phone layout overflows');
  }
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-answer-ack-mobile.png',
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.unroute('**/api/automations/answers/save');
  await page.locator('button[data-view="settings"]').click();
  await page.locator('main[data-view="settings"]').waitFor();
  await page.evaluate(() => globalThis.scrollTo(0, 700));
  await page.locator('button[data-view="contacts"]').click();
  await page.locator('main[data-view="contacts"]').waitFor();
  await page.goBack();
  await page.locator('main[data-view="settings"]').waitFor();
  await page.waitForFunction(() => globalThis.scrollY >= 690);
  return {
    refusedEditPreserved: true,
    navigation: 'settings → contacts → back',
    restoredScroll: await page.evaluate(() => globalThis.scrollY),
  };
};
