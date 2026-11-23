async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  const repoUrl = 'https://github.com/fixture-owner/reviewed-task';
  const issueUrl = `${repoUrl}/issues/1`;
  const slot = 'assignment-handoff-mcp';
  if (!form) {
    throw new Error('Supply the isolated form in ?fixture=.');
  }
  const writes = [];
  const exceptions = [];
  page.on('pageerror', (error) => exceptions.push(error.message));
  page.on('request', (request) => {
    const action = new URL(request.url()).pathname.match(
      /^\/api\/forms\/assignment\/(draft|restore|publish)$/u
    )?.[1];
    if (action) {
      writes.push(action);
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
  const open = async () => {
    await page.goto(`${location.origin}/#/forms`);
    await page.locator('[data-form-url]').fill(form);
    await page.locator('[data-form-slot]').fill(slot);
    if (!(await page.locator('[data-review-action="read"]').count())) {
      await page.locator('[data-action="open-form-review"]').click();
    }
    await page.locator('[data-review-action="read"]').click();
    await page
      .locator('[data-form-profile]')
      .selectOption('qa-profile:forms-fixture');
    await page.locator('[data-action="plan-form"]').click();
  };
  const close = async () => {
    await page.locator('[data-review-action="close"]').click();
    await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  };
  const card = page.locator('[data-form-assignment]');
  const issue = card.getByRole('link', {
    name: 'Assignment issue #1',
    exact: true,
  });
  const publisher = card.locator('[data-assignment-publisher]');
  await open();
  await publisher
    .getByLabel('GitHub owner/repository')
    .fill('fixture-owner/reviewed-task');
  await publisher.locator('[data-action="draft-assignment"]').click();
  await publisher.locator('[data-assignment-draft]').waitFor();
  await publisher.locator('[data-action="publish-assignment"]').click();
  await publisher.getByRole('alert').waitFor();
  if (await issue.count()) {
    throw new Error('An uncertain publication exposed a confirmed issue.');
  }
  await page.reload();
  await open();
  await publisher.locator('[data-action="restore-assignment"]').click();
  await publisher.locator('[data-assignment-draft]').waitFor();
  await publisher.locator('[data-action="publish-assignment"]').click();
  await issue.waitFor();
  const immediate = await issue.getAttribute('href');
  const writesBeforeReopening = [...writes];
  await close();
  await page.reload();
  await open();
  await issue.waitFor();
  await card
    .getByText(/Complete and review the assignment before submitting/)
    .waitFor();
  const result = {
    immediate,
    reopened: await issue.getAttribute('href'),
    repository: await card
      .getByRole('link', { name: repoUrl, exact: true })
      .getAttribute('href'),
    writes,
    writesBeforeReopening,
    exceptions,
    layout: await page.evaluate(() => ({
      content: globalThis.document.documentElement.scrollWidth,
      viewport: globalThis.innerWidth,
    })),
  };
  if (
    result.immediate !== issueUrl ||
    result.reopened !== issueUrl ||
    result.repository !== repoUrl ||
    writes.join(',') !== 'draft,publish,restore,publish' ||
    writes.length !== writesBeforeReopening.length ||
    exceptions.length ||
    result.layout.content > result.layout.viewport
  ) {
    throw new Error(JSON.stringify(result));
  }
  await issue.evaluate((node) =>
    node.scrollIntoView({ block: 'center', behavior: 'instant' })
  );
  return result;
};
