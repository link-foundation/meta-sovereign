async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { start, owner, confirmed, state, page, action, require } = tools;
    await start();
    await owner('draft-owner-fill', 'POST');
    await owner('hold-resume-visible', 'POST');
    await confirmed('read');
    await state('resume-not-visible');
    const values = await owner('draft-values');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.letter ===
        'Actual edited owner letter.', 'The refusal changed owner answers');
    require(values.submissions ===
      0, 'The refusal submitted the synthetic form');
    await action('close').click();
    await state('closed');
    await page.reload();
    const skips = page.locator('[data-vacancy-skips="jobs"]');
    const row = skips.locator(
      '[data-vacancy-skip="https://hh.ru/vacancy/123"]'
    );
    await row.waitFor();
    require((await row.innerText()).includes(
      'résumé'
    ), 'The durable refusal lost its reason');
    await skips.screenshot({
      path: 'docs/screenshots/issue-56-vacancy-skips/mcp-after.png',
    });
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Recorded refusals overflow a phone');
    await skips.screenshot({
      path: 'docs/screenshots/issue-56-vacancy-skips/mcp-phone.png',
    });
    await skips
      .locator('[data-vacancy-skip-action="clear-resume_not_visible"]')
      .click();
    await row.waitFor({ state: 'detached' });
    await page.reload();
    await skips.locator('[data-vacancy-skip-empty]').waitFor();
    require((await skips.locator('[data-vacancy-skip]').count()) ===
      0, 'Cleared refusal returned after reload');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      tools.errors.length === 0, 'Owned fixture did not drain');
    return {
      persistedAfterReload: true,
      clearPersisted: true,
      ownerValuesPreserved: true,
      providerSubmissions: values.submissions,
      browserClosed: stats.closed,
      phoneFits: true,
      errors: tools.errors,
    };
  });
