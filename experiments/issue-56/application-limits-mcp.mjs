async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const {
      start,
      panel,
      owner,
      require,
      confirmed,
      confirm,
      action,
      page,
      errors,
    } = tools;
    await start(async () => {
      await panel.locator('[data-application-option="supervised"]').check();
    });
    await owner('draft-owner-fill', 'POST');
    await owner('limit-show', 'POST');
    await confirmed('read');
    await owner('limit-dismiss', 'POST');
    await confirmed('read');
    await panel.locator('[data-application-limit="waiting"]').waitFor();
    const deadline = await panel
      .locator('[data-application-limit-until]')
      .getAttribute('data-application-limit-until');
    await confirm();
    for (const name of ['answers', 'letter', 'submit', 'restore']) {
      require(await action(
        name
      ).isDisabled(), `${name} admitted a shared daily pause`);
    }
    await panel.screenshot({
      path: 'docs/screenshots/application-limits-after.png',
    });
    await tools.locales('limit="waiting"', 'submit');
    require((await panel
      .locator('[data-application-limit-until]')
      .getAttribute('data-application-limit-until')) ===
      deadline, 'Read-only recovery extended the deadline');
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Limit view overflows phone');
    await panel.screenshot({
      path: 'docs/screenshots/application-limits-phone.png',
    });
    await owner('limit-expire', 'POST');
    await confirmed('read');
    await panel.locator('[data-application-limit="elapsed"]').waitFor();
    require((await panel
      .locator('[data-application-hold="daily-limit"]')
      .count()) === 1, 'Expiry released the native manual hold');
    const values = await owner('limit-values');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.letter ===
        'Actual edited owner letter.', 'Daily pause lost owner values');
    require(values.entries === 1 &&
      values.sends === 0, 'Recovery repeated native entry or sent');
    await action('close').click();
    await tools.state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Daily limit fixture did not drain');
    return {
      deadline,
      locales: 4,
      ownerValuesPreserved: true,
      sends: 0,
      entries: 1,
      resourcesClosed: true,
      errors,
    };
  });
