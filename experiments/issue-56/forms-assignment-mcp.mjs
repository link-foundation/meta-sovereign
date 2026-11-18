async (page) => {
  const location = new URL(page.url());
  const form = location.searchParams.get('fixture');
  if (!form) {
    throw new Error('Supply the isolated assignment in ?fixture=.');
  }
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${location.origin}/#/forms`);
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('assignment-mcp');
  await page.locator('[data-action="open-form-review"]').click();
  await page.locator('[data-review-action="read"]').click();
  await page
    .locator('[data-form-profile]')
    .selectOption('qa-profile:forms-fixture');
  await page.evaluate(() => {
    globalThis.__assignmentProof = {};
    for (const name of [
      'formsPlanReview',
      'formsPrefillReview',
      'formsApplyReview',
    ]) {
      const original = globalThis.__msApi[name];
      globalThis.__msApi[name] = async (input) => {
        const result = await original(input);
        globalThis.__assignmentProof[name] = result;
        return result;
      };
    }
  });
  const capture = async (state) => {
    for (const [layout, width, height] of [
      ['desktop', 1200, 800],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page
        .locator('[data-form-assignment]')
        .evaluate((node) =>
          node.scrollIntoView({ block: 'center', behavior: 'instant' })
        );
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > globalThis.innerWidth
        )
      ) {
        throw new Error('Assignment controls overflow.');
      }
      await page.screenshot({
        path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-forms-assignment-mcp-${state}-${layout}.png`,
      });
    }
    await page.setViewportSize({ width: 1200, height: 800 });
  };
  await page.locator('[data-action="plan-form"]').click();
  await page
    .locator('[data-form-assignment-state="needs-repository"]')
    .first()
    .waitFor();
  const held = await page.evaluate(
    () => globalThis.__assignmentProof.formsPlanReview.planning.proposed
  );
  if (held !== 0) {
    throw new Error('Assignment did not hold the form.');
  }
  await page.locator('[data-action="prefill-form"]').click();
  await page.locator('[data-form-automatic-result="refused"]').waitFor();
  await capture('held');
  const repository = 'https://github.com/fixture-owner/reviewed-task';
  await page
    .locator('[data-form-assignment-url]')
    .fill('https://github.com/fixture-owner/missing');
  await page.locator('[data-action="link-assignment-repository"]').click();
  await page
    .locator('[data-form-assignment-error="form-assignment-unverified"]')
    .waitFor();
  const preserved = (
    await page.locator('[data-form-assignment-url]').inputValue()
  ).endsWith('/missing');
  await page.locator('[data-form-assignment-url]').fill(repository);
  await page.locator('[data-action="link-assignment-repository"]').click();
  await page.locator('[data-form-assignment-state="verified"]').waitFor();
  await page.locator('[data-action="plan-form"]').click();
  await page.locator('[data-form-fill]').waitFor();
  const fields = await page.evaluate(() =>
    globalThis.__assignmentProof.formsPlanReview.fields
      .filter((field) => ['english', 'task'].includes(field.name))
      .map((field) => field.id)
  );
  if (fields.length !== 2) {
    throw new Error('Missing reviewed fixture fields.');
  }
  for (const id of fields) {
    await page.locator(`[data-form-select="${id}"]`).check();
  }
  await page.locator('[data-action="apply-form-plan"]').click();
  await page.locator('[data-form-application="applied"]').waitFor();
  await capture('verified');
  const proof = await page.evaluate(() => {
    const saved = globalThis.__assignmentProof;
    const refusal = saved.formsPrefillReview;
    const applied = saved.formsApplyReview;
    return {
      heldProposals: 0,
      refusal: refusal.code,
      refusedWrites: refusal.receipts.length,
      refusedUploads: refusal.uploads.length,
      applied: applied.receipts.length,
      readback: Object.fromEntries(
        applied.report.fields
          .filter((field) =>
            ['name', 'english', 'task', 'github'].includes(field.name)
          )
          .map((field) => [field.name, field.value])
      ),
    };
  });
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { ...proof, failurePreserved: preserved, closed: true };
};
