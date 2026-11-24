async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  if (!form) {
    throw new Error('Supply the isolated assignment in ?fixture=.');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
    await page.locator('[data-form-slot]').fill('publication-mcp');
    if (!(await page.locator('[data-review-action="read"]').count())) {
      await page.locator('[data-action="open-form-review"]').click();
    }
    await page.locator('[data-review-action="read"]').click();
    await page
      .locator('[data-form-profile]')
      .selectOption('qa-profile:forms-fixture');
    await page.evaluate(() => {
      globalThis.__publicationProof = {};
      for (const name of [
        'draftFormAssignment',
        'publishFormAssignment',
        'restoreFormAssignment',
        'formsPlanReview',
      ]) {
        const original = globalThis.__msApi[name];
        globalThis.__msApi[name] = async (...input) => {
          const result = await original(...input);
          globalThis.__publicationProof[name] = result;
          return result;
        };
      }
    });
    await page.locator('[data-action="plan-form"]').click();
    await page
      .locator('[data-form-assignment-state="needs-repository"]')
      .first()
      .waitFor();
  };
  const capture = async (state, locator) => {
    for (const [layout, width, height] of [
      ['desktop', 1200, 800],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        (expected) => globalThis.innerWidth === expected,
        width
      );
      await locator.evaluate((node) =>
        node.scrollIntoView({ block: 'center', behavior: 'instant' })
      );
      await page.waitForFunction(
        (node) => {
          const bounds = node.getBoundingClientRect();
          return (
            bounds.width > 0 &&
            bounds.bottom > 0 &&
            bounds.top < globalThis.innerHeight
          );
        },
        await locator.elementHandle()
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
        throw new Error('Publisher overflows.');
      }
      await page.screenshot({
        path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-assignment-publication-mcp-${state}-${layout}.png`,
      });
    }
    await page.setViewportSize({ width: 1200, height: 800 });
  };
  const proof = (name) =>
    page.evaluate((key) => globalThis.__publicationProof[key], name);
  await open();
  const held = (await proof('formsPlanReview')).planning.proposed;
  if (held !== 0) {
    throw new Error('The whole form was not held.');
  }
  const control = page.locator('[data-assignment-publisher]');
  await control
    .locator('[data-assignment-publish-input="target"]')
    .fill('fixture-owner/reviewed-task');
  await control.locator('[data-action="draft-assignment"]').click();
  await control.locator('[data-assignment-draft]').waitFor();
  const preview = (await proof('draftFormAssignment')).draft;
  await capture('review', control.locator('[data-assignment-draft]'));
  await control.locator('[data-action="publish-assignment"]').click();
  await control.getByRole('alert').waitFor();
  const unknown = await proof('publishFormAssignment');
  if (unknown.state !== 'uncertain') {
    throw new Error('Lost response claimed success.');
  }
  await capture('uncertain', control.getByRole('alert'));
  await open();
  await page.locator('[data-action="restore-assignment"]').click();
  await control.locator('[data-assignment-draft]').waitFor();
  const restored = await proof('restoreFormAssignment');
  if (!restored.attempted || restored.draft.id !== preview.id) {
    throw new Error('Issued draft was not restored.');
  }
  await control.locator('[data-action="publish-assignment"]').click();
  await control.locator('[data-assignment-published]').waitFor();
  await capture('verified', control.locator('[data-assignment-published]'));
  const result = await proof('publishFormAssignment');
  await page.locator('[data-action="plan-form"]').click();
  await page.locator('[data-form-fill]').waitFor();
  const planned = await proof('formsPlanReview');
  const repositoryAnswer = planned.fields.find((field) => field.name === 'task')
    .answer.text;
  if (repositoryAnswer !== 'https://github.com/fixture-owner/reviewed-task') {
    throw new Error('Wrong result field link.');
  }
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  if (errors.length) {
    throw new Error(JSON.stringify(errors));
  }
  return {
    draftId: preview.id,
    restored: restored.attempted,
    state: result.state,
    issue: result.issue.url,
    repositoryAnswer,
    heldUntilReadback: true,
    pageErrors: errors,
    closed: true,
  };
};
