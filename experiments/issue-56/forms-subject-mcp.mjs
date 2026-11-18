async (page) => {
  const form = new URL(page.url()).searchParams.get('fixture');
  if (!form) {
    throw new Error('Open the app with the isolated form URL in ?fixture=.');
  }
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLanguage', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.reload();
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('application-2');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-form-review]').waitFor();
  await page.locator('[data-review-action="read"]').click();
  await page.locator('[data-form-field]').first().waitFor();
  await page.locator('[data-form-profile]').selectOption('');
  await page.locator('[data-action="plan-form"]').click();
  await page.locator('[data-form-plan-summary]').waitFor();
  const cards = page.locator('[data-form-field]');
  const wrong = cards.nth(0);
  const right = cards.nth(1);
  const proposals = await cards.allTextContents();
  if (await wrong.locator('[data-form-select]').count()) {
    throw new Error('C# still offers the Go answer');
  }
  if (
    !(await right.innerText()).includes(
      'Proposed: Three years building Go services\n'
    ) ||
    !(await right.innerText()).includes('Similar saved question')
  ) {
    throw new Error('Golang alias lost its reviewed saved answer');
  }
  await right.locator('[data-form-select]').check();
  await wrong.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-forms-subjects-mcp-desktop.png',
    scale: 'css',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await wrong.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  const phoneOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > globalThis.innerWidth
  );
  if (phoneOverflow) {
    throw new Error('Subject review overflows phone width');
  }
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-forms-subjects-mcp-mobile.png',
    scale: 'css',
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-application="applied"]').waitFor();
  const receipts = await page.locator('[data-form-receipt="applied"]').count();
  if (receipts !== 1) {
    throw new Error(`Expected one confirmed alias field, got ${receipts}`);
  }
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { proposals, receipts, phoneOverflow, reviewClosed: true };
};
