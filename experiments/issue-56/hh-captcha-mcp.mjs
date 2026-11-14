async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { start, owner, confirmed, panel, action, page, require } = tools;
    await start(async () =>
      panel.locator('[data-application-option="supervised"]').check()
    );
    await owner('draft-owner-fill', 'POST');
    await owner('captcha-hidden', 'POST');
    await confirmed('read');
    require((await panel
      .locator('[data-application-state="review"]')
      .count()) === 1, 'Hidden gate caused a hold');
    for (const marker of ['qa', 'name']) {
      await owner(`captcha-${marker}`, 'POST');
      await confirmed('read');
      require((await panel
        .locator('[data-application-state="verification"]')
        .count()) === 1, 'HH verification missing');
      const report = await owner('captcha-report');
      require(report.challenge?.active &&
        report.fields.length === 0, 'Challenge became answer evidence');
      require(!(await panel.innerText()).includes(
        'Owner-only synthetic verification answer'
      ), 'Challenge answer leaked');
      const counters = await owner('captcha-stats');
      require([
        'answerReads',
        'htmlReads',
        'closes',
        'renews',
        'submits',
        'sends',
      ].every(
        (name) => counters[name] === 0
      ), 'Challenge was read or acted on');
    }
    await tools.locales('state="verification"', 'submit');
    await panel.screenshot({
      path: 'docs/screenshots/hh-captcha-after-mcp.png',
    });
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Verification overflows phone');
    await panel.screenshot({
      path: 'docs/screenshots/hh-captcha-after-mcp-phone.png',
    });
    await owner('limit-show', 'POST');
    await confirmed('read');
    require((await panel
      .locator('[data-application-state="daily-limit"]')
      .count()) === 1, 'Daily-limit priority lost');
    await owner('captcha-clear', 'POST');
    await owner('limit-dismiss', 'POST');
    await confirmed('read');
    const values = await owner('limit-values');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.sends === 0, 'Owner values lost or application sent');
    await action('close').click();
    await tools.state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      !stats.pageErrors.length &&
      !tools.errors.length, 'Fixture did not drain');
    return {
      markers: 2,
      hiddenIgnored: true,
      completedTokenDoesNotWaiveHh: true,
      challengeReads: 0,
      challengeActions: 0,
      dailyLimitPriority: true,
      ownerValuesPreserved: true,
      locales: 4,
      sends: 0,
      resourcesClosed: true,
      errors: tools.errors,
    };
  });
