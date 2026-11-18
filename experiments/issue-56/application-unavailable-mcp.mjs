async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const {
      start,
      owner,
      confirmed,
      state,
      page,
      panel,
      action,
      require,
      before,
    } = tools;
    await start();
    await owner('draft-owner-fill', 'POST');
    await owner('unavailable-hidden', 'POST');
    await confirmed('read');
    await state('review');
    await owner('unavailable-show', 'POST');
    await confirmed('read');
    if (before) {
      await panel.screenshot({
        path: 'docs/screenshots/issue-56-application-unavailable/mcp-before.png',
      });
    }
    await state('vacancy-unavailable');
    await tools.confirm();
    require((await action('submit').isDisabled()) &&
      (await action(
        'prefill'
      ).isDisabled()), 'Account refusal admitted a native action');
    await panel.screenshot({
      path: 'docs/screenshots/issue-56-application-unavailable/mcp-after.png',
    });
    await tools.locales('state="vacancy-unavailable"', 'submit');
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Account refusal overflows a phone');
    await panel.screenshot({
      path: 'docs/screenshots/issue-56-application-unavailable/mcp-phone.png',
    });
    await owner('unavailable-clear', 'POST');
    await confirmed('read');
    await panel
      .locator('[data-application-hold="vacancy-unavailable"]')
      .waitFor();
    const values = await owner('draft-values');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.letter === 'Actual edited owner letter.' &&
      values.submissions ===
        0, 'Account refusal changed or sent owner answers');
    await action('close').click();
    await state('closed');
    await page.reload();
    const skips = page.locator('[data-vacancy-skips="jobs"]');
    const row = skips.locator('[data-vacancy-skip]');
    await row.waitFor();
    require((await row.innerText()).includes(
      'HH closed this vacancy to your account'
    ), 'Durable account refusal lost its reason');
    await skips.screenshot({
      path: 'docs/screenshots/issue-56-application-unavailable/mcp-recorded.png',
    });
    await skips
      .locator('[data-vacancy-skip-action="clear-vacancy_unavailable"]')
      .click();
    await row.waitFor({ state: 'detached' });
    await page.reload();
    await skips.locator('[data-vacancy-skip-empty]').waitFor();
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      tools.errors.length === 0, 'Owned account-refusal fixture did not drain');
    return {
      renderedWarningBlocked: true,
      collapsedIgnored: true,
      persistedAfterReload: true,
      clearPersisted: true,
      ownerAnswersPreserved: true,
      providerSubmissions: 0,
      phoneFits: true,
      browsersClosed: stats.closed,
      errors: tools.errors,
    };
  });
