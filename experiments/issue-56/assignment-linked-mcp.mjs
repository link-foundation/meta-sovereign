async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  const url = new URL('/source-redirect', form).href;
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/forms/assignment/')) {
      requests.push(pathname.split('/').at(-1));
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${location.origin}/#/forms`);
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('linked-mcp');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  await page.locator('[data-action="plan-form"]').click();
  const publisher = page.locator(
    '[data-form-assignment] [data-assignment-publisher]'
  );
  await publisher
    .locator('[data-assignment-publish-input="target"]')
    .fill('fixture-owner/linked-task');
  const draft = publisher.locator('[data-action="draft-assignment"]');
  const disabledBeforeSelection = await draft.isDisabled();
  const choice = publisher.locator(
    '[data-assignment-publish-input="detected-source"]'
  );
  const choices = await choice
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  await choice.selectOption(url);
  const selected = await publisher
    .locator('[data-assignment-publish-input="source"]')
    .inputValue();
  const requestsBeforeDraft = requests.length;
  await draft.click();
  const evidence = publisher.locator('[data-assignment-source-evidence]');
  await evidence.waitFor();
  const resolved = await evidence.locator('a').getAttribute('href');
  const width = await page.evaluate(() => ({
    viewport: globalThis.innerWidth,
    content: globalThis.document.documentElement.scrollWidth,
  }));
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  const result = {
    disabledBeforeSelection,
    choices,
    selected,
    requestsBeforeDraft,
    resolved,
    requests,
    width,
    errors,
  };
  if (
    !disabledBeforeSelection ||
    choices.join('|') !== `|${url}` ||
    selected !== url ||
    requestsBeforeDraft ||
    resolved !== new URL('/instructions', form).href ||
    requests.join(',') !== 'draft' ||
    width.content > width.viewport ||
    errors.length
  ) {
    throw new Error(JSON.stringify(result));
  }
  return result;
};
