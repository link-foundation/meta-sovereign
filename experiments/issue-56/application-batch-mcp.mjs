async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { page, panel, owner, require, action, confirmed, errors } = tools;
    const vacancies = page.locator('[data-vacancies]');
    await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
    await vacancies.locator('[data-vacancy-action="search"]').click();
    await vacancies.locator('[data-vacancy-action="collect"]').first().click();
    await panel.locator('[data-application-missing]').waitFor();
    await panel
      .locator('[data-application-option="autoSelectResumeLanguage"]')
      .uncheck();
    await panel.locator('[data-application-option="pacing"]').check();
    await panel.locator('[data-application-pacing-interval]').fill('2');
    const batch = panel.locator('[data-application-batch]');
    const field = (name) =>
      batch.locator(`[data-application-batch-field="${name}"]`);
    const button = (name) =>
      batch.locator(`[data-application-batch-action="${name}"]`);
    const phase = (name) =>
      batch
        .locator(`[data-application-batch-phase="${name}"]`)
        .waitFor({ timeout: 45000 });
    await field('urls').fill('https://hh.ru/vacancy/123');
    await field('noQuestionnaires').check();
    await field('confirmBatch').check();
    const baseline = await owner('stats');
    await button('start').click();
    await phase('questionnaires-held');
    let stats = await owner('stats');
    require(stats.opens === baseline.opens + 1 &&
      stats.closed &&
      stats.batchEffects.every(
        (row) => !row.entries && !row.attempts
      ), 'Initial deferral dispatched or retained a browser');
    await field('batchQuestionnaires').click();
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '[data-application-batch-field="batchQuestionnaires"]'
        ).checked
    );
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-application-batch-action="follow"]')
          .disabled
    );
    await button('follow').click();
    await panel.locator('[data-application-continuation="send"]').waitFor();
    const values = await owner('draft-values');
    require(values.experience === 'Five years building Python services.' &&
      values.entries === 0 &&
      values.submissions ===
        0, 'Revisit bypassed review or lost the known answer');
    require(await action(
      'confirm-step'
    ).isDisabled(), 'Batch reused Start consent for Send');
    await tools.locales('continuation="send"', 'confirm-step');
    await panel.screenshot({
      path: 'docs/screenshots/application-batch-after-mcp.png',
    });
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Phone overflow');
    await panel.screenshot({
      path: 'docs/screenshots/application-batch-after-mcp-phone.png',
    });
    await confirmed('confirm-step');
    await phase('completed');
    stats = await owner('stats');
    const sends = stats.batchEffects.reduce(
      (sum, row) => sum + row.attempts,
      0
    );
    require(stats.closed &&
      sends === 1 &&
      stats.batchEffects.every(
        (row) => !row.entries
      ), 'Completion failed to drain or repeated an application');
    await page.reload();
    await phase('completed');
    const recovered = await owner('stats');
    require(recovered.opens === stats.opens &&
      recovered.closed &&
      recovered.pageErrors.length === 0 &&
      errors.length === 0, 'Reload replayed work or fixture reported errors');
    return {
      deliveries: 1,
      queueRevisits: 1,
      sends,
      entries: 0,
      locales: 4,
      phone: true,
      recoveryReplayed: false,
      resourcesClosed: true,
      errors,
    };
  });
