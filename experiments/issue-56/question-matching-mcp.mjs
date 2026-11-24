async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  if (!form) {
    throw new Error('Supply the isolated matching fixture in ?fixture=.');
  }
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLanguage', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${location.origin}/#/automation`);
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const preview = panel.locator('details').filter({
    has: page
      .locator(':scope > summary')
      .getByText('Preview answer', { exact: true }),
  });
  await preview.locator(':scope > summary').click();
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill('What is your current city of residence?');
  const settings = preview.locator('[data-question-matching]');
  await settings.getByLabel('Minimum similarity (%)').fill('60');
  await settings.getByLabel('Match letter case').check();
  await preview.getByLabel('Inspect all eligible matches').check();
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  const matches = preview.locator('[data-answer-matches]');
  await matches.getByText('Matches 1–10 of 12', { exact: true }).waitFor();
  if ((await matches.locator('[data-ranked-match]').count()) !== 10) {
    throw new Error('First match page is not bounded to ten entries.');
  }
  await matches
    .getByRole('button', { name: 'Next matches', exact: true })
    .click();
  await matches.getByText('Matches 11–12 of 12', { exact: true }).waitFor();
  const last = await matches.locator('[data-ranked-match]').allTextContents();
  if (
    last.length !== 2 ||
    !last[0].includes('Hanoi, district 2.') ||
    !last[1].includes('Hanoi, district 1.') ||
    !last.every((text) => text.includes('Similarity: 72.73%'))
  ) {
    throw new Error(
      'The final two ranked matches or their scores are missing.'
    );
  }
  for (const [name, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await matches.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => globalThis.scrollBy(0, -72));
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > globalThis.innerWidth
      )
    ) {
      throw new Error(`Ranked matching overflows ${name}.`);
    }
    await page.screenshot({
      path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-question-matching-mcp-${name}.png`,
      scale: 'css',
    });
  }
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`${location.origin}/#/forms`);
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('matching-review');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page.locator('[data-form-planner]').waitFor();
  const matching = page.locator('[data-form-planner] [data-question-matching]');
  await matching.getByLabel('Minimum similarity (%)').fill('60');
  await matching.getByLabel('Match letter case').check();
  await page.locator('[data-action="plan-form"]').click();
  await page.locator('[data-form-plan-summary]').waitFor();
  const cards = page.locator('[data-form-field]');
  const proposals = await cards.allTextContents();
  if (
    !proposals[0].includes('Proposed: Hanoi, district 12.') ||
    !proposals[1].includes('Needs an answer') ||
    !proposals[2].includes('Owner keeps this city')
  ) {
    throw new Error(
      'Form threshold, case sensitivity or owner protection failed.'
    );
  }
  await cards.first().locator('[data-form-select]').check();
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-application="applied"]').waitFor();
  const receipts = await page.locator('[data-form-receipt="applied"]').count();
  if (receipts !== 1) {
    throw new Error('The actual field write needs exactly one receipt.');
  }
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return {
    firstPage: 10,
    last,
    proposals,
    receipts,
    phoneOverflow: false,
    reviewClosed: true,
  };
};
