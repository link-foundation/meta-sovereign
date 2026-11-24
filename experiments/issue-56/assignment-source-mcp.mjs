async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  if (!form) {
    throw new Error('Supply the isolated form in ?fixture=.');
  }
  const before = location.searchParams.has('before');
  const source = new URL('/source-redirect', form).href;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${location.origin}/#/forms`);
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('source-mcp');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  await page.locator('[data-action="plan-form"]').click();
  const control = page.locator('[data-assignment-publisher]');
  await control.waitFor();
  const capture = async (state, target) => {
    for (const [layout, width, height] of [
      ['desktop', 1200, 800],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        (expected) => globalThis.innerWidth === expected,
        width
      );
      await target.evaluate((node) =>
        node.scrollIntoView({ block: 'center', behavior: 'instant' })
      );
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            globalThis.requestAnimationFrame(() =>
              globalThis.requestAnimationFrame(resolve)
            )
          )
      );
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > globalThis.innerWidth
        )
      ) {
        throw new Error('Source review overflows.');
      }
      await page.screenshot({
        path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-assignment-source-mcp-${state}-${layout}.png`,
      });
    }
  };
  const input = control.locator('[data-assignment-publish-input="source"]');
  if (before) {
    if (await input.count()) {
      throw new Error('Before bundle already contains source input.');
    }
    await capture(
      'before',
      control.locator('[data-assignment-publish-input="vacancy"]')
    );
  } else {
    await control
      .locator('[data-assignment-publish-input="target"]')
      .fill('fixture-owner/reviewed-task');
    await input.fill(source);
    await capture('input', input);
    await page.evaluate(() => {
      const api = globalThis.__msApi;
      for (const name of ['draftFormAssignment', 'restoreFormAssignment']) {
        const original = api[name];
        api[name] = async (...args) => {
          const result = await original(...args);
          globalThis.__assignmentSourceResult = result;
          return result;
        };
      }
    });
    await control.locator('[data-action="draft-assignment"]').click();
    await control.locator('[data-assignment-source-evidence]').waitFor();
    const draft = await page.evaluate(
      () => globalThis.__assignmentSourceResult.draft
    );
    if (
      draft.sourceEvidence.requestedUrl !== source ||
      !draft.sourceEvidence.url.endsWith('/instructions') ||
      !draft.body.includes('three pages') ||
      !draft.body.includes('## Deliverable and stack') ||
      !draft.body.includes('## Stack')
    ) {
      throw new Error('Source or written requirements were lost.');
    }
    await capture(
      'review',
      control.locator('[data-assignment-source-evidence]')
    );
    await control.locator('[data-action="restore-assignment"]').click();
    await page.waitForFunction(
      (id) =>
        globalThis.__assignmentSourceResult?.draft.id === id &&
        typeof globalThis.__assignmentSourceResult.attempted === 'boolean',
      draft.id
    );
    if ((await input.inputValue()) !== source) {
      throw new Error('Restored source differs.');
    }
  }
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  if (errors.length) {
    throw new Error(JSON.stringify(errors));
  }
  return { before, source, closed: true, pageErrors: errors };
};
