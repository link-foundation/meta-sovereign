async (page) => {
  const address = new URL(page.url());
  const formUrl = address.searchParams.get('fixture');
  const vacancyUrl = 'https://hh.ru/vacancy/12345678901234567890';
  const errors = [];
  const writes = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (
      /\/api\/forms\/(?:assignment\/publish|sessions\/apply)$/u.test(
        request.url()
      )
    ) {
      writes.push(request.url());
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
  await page.goto(`${address.origin}/#/forms`);
  const review = async (action, locator) => {
    const result = page.waitForResponse((response) =>
      response.url().endsWith(`/api/forms/sessions/${action}`)
    );
    await page.locator(locator).click();
    return (await result).status();
  };
  await page.locator('[data-form-url]').fill(formUrl);
  await page.locator('[data-form-slot]').fill('application-2');
  const opened = await review('open', '[data-action="open-form-review"]');
  const read = await review('read', '[data-review-action="read"]');
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  const planned = await review('plan', '[data-action="plan-form"]');
  const publisher = page.locator(
    '[data-form-assignment] [data-assignment-publisher]'
  );
  await publisher
    .locator('[data-assignment-publish-input="target"]')
    .fill('fixture-owner/chat-task');
  const pending = page.waitForResponse((response) =>
    response.url().endsWith('/api/forms/assignment/draft')
  );
  await publisher.locator('[data-action="draft-assignment"]').click();
  const response = await pending;
  const link = publisher.locator(
    `[data-assignment-draft] a[href="${vacancyUrl}"]`
  );
  await link.waitFor();
  const reviewed = await link.textContent();
  const override = await publisher
    .locator('[data-assignment-publish-input="vacancy"]')
    .inputValue();
  const fits = await page.evaluate(
    () =>
      globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
  );
  const draft = response.status();
  const result = {
    opened,
    read,
    planned,
    draft,
    reviewed,
    override,
    fits,
    errors,
    writes,
  };
  if (
    [opened, read, planned, draft].some((status) => status !== 200) ||
    !reviewed.includes('Python engineer') ||
    override ||
    !fits ||
    errors.length ||
    writes.length
  ) {
    throw new Error(JSON.stringify(result));
  }
  await link.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  return result;
};
