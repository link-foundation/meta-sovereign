async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { start, panel, owner, require, confirmed, action, page, errors } =
      tools;
    const pending = (step) =>
      panel.locator(`[data-application-continuation="${step}"]`).waitFor();
    await start(async () => {
      await panel
        .locator('[data-application-letter]')
        .fill('Independent MCP reviewed letter.');
      await panel.locator('[data-application-confirmation="answers"]').check();
      await panel
        .locator('[data-application-confirmation="cover-letter"]')
        .check();
    }, 'form');
    await action('continue').click();
    await pending('answers');
    let values = await owner('draft-values');
    require(values.experience === '' &&
      values.letter === null &&
      values.submissions === 0 &&
      values.entries ===
        0, 'Continuation crossed an unconfirmed answer boundary');
    require(await action(
      'confirm-step'
    ).isDisabled(), 'Continue reused entry consent');
    await confirmed('confirm-step');
    await pending('cover-letter');
    values = await owner('draft-values');
    require(values.experience === 'Five years building Python services.' &&
      values.letter === null &&
      values.submissions ===
        0, 'Answer confirmation attached a letter or sent');
    await page.reload();
    await pending('cover-letter');
    require(await action(
      'confirm-step'
    ).isDisabled(), 'Reload reused step consent');
    await confirmed('confirm-step');
    await pending('send');
    values = await owner('draft-values');
    require(values.letter === 'Independent MCP reviewed letter.' &&
      values.submissions === 0, 'Letter confirmation sent the questionnaire');
    await tools.locales('continuation="send"', 'confirm-step');
    await panel.screenshot({
      path: 'docs/screenshots/application-confirmations-after-mcp.png',
    });
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Phone overflow');
    await panel.screenshot({
      path: 'docs/screenshots/application-confirmations-after-mcp-phone.png',
    });
    await confirmed('confirm-step');
    await panel
      .locator('[data-application-delivery="provider-confirmed"]')
      .waitFor();
    values = await owner('draft-values');
    require(values.submissions === 1 &&
      values.entries === 0, 'Explicit Send was repeated');
    await action('close').click();
    await tools.state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Fixture did not drain');
    return {
      locales: 4,
      phone: true,
      confirmations: 3,
      entries: 0,
      sends: 1,
      recoveryReplayed: false,
      resourcesClosed: true,
      errors,
    };
  });
