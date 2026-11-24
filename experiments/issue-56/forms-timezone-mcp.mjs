async (page) => {
  const form = new URL(page.url()).searchParams.get('fixture');
  if (!form) {
    throw new Error('Open the fixture app with its form URL in ?fixture=.');
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
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:form-place');
  await page.locator('[data-action="plan-form"]').click();
  await page.locator('[data-form-plan-summary]').waitFor();
  const labels = [
    'Ваш город и сколько от мск (+- х мск)',
    'City and UTC offset',
    'Time zone',
    'Город',
  ];
  const cards = labels.map((label) =>
    page
      .locator('[data-form-field]')
      .filter({ has: page.getByText(label, { exact: true }) })
  );
  const proposals = [];
  const expected = [
    'Нячанг, Вьетнам, UTC+7, МСК+4',
    'Нячанг, Вьетнам, UTC+7, МСК+4',
    'UTC+7, МСК+4',
    'Нячанг, Вьетнам',
  ];
  for (const [index, card] of cards.entries()) {
    const text = await card.innerText();
    if (!text.includes(`Proposed: ${expected[index]}\n`)) {
      throw new Error(`Missing configured place: ${text}`);
    }
    proposals.push(text);
    await card.locator('[data-form-select]').check();
  }
  await cards[0].evaluate((element) =>
    element.scrollIntoView({ block: 'start' })
  );
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-forms-timezone-mcp-desktop.png',
    scale: 'css',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await cards[0].evaluate((element) =>
    element.scrollIntoView({ block: 'start' })
  );
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  const phoneOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > globalThis.innerWidth
  );
  if (phoneOverflow) {
    throw new Error('Time-zone proposal overflows the phone width');
  }
  await page.screenshot({
    path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-forms-timezone-mcp-mobile.png',
    scale: 'css',
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-application="applied"]').waitFor();
  const receipts = await page.locator('[data-form-receipt="applied"]').count();
  if (receipts !== 4) {
    throw new Error(`Expected four actual receipts, got ${receipts}`);
  }
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { proposals, receipts, phoneOverflow, reviewClosed: true };
};
