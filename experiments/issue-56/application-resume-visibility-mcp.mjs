async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { start, panel, action, page, owner, require, confirmed, state } =
      tools;
    await start(async () => {
      await panel.locator('[data-application-option="autoExact"]').check();
    });
    await owner('draft-owner-fill', 'POST');
    await owner('hold-resume-collapsed', 'POST');
    await confirmed('read');
    require((await panel
      .locator('[data-application-state="review"]')
      .count()) === 1, 'Collapsed warning blocked review');
    require((await panel.locator('[data-application-hold]').count()) ===
      0, 'Collapsed warning created a hold');
    await owner('hold-resume-visible', 'POST');
    await confirmed('read');
    await state('resume-not-visible');
    await tools.confirm();
    require(await action(
      'submit'
    ).isDisabled(), 'Visible warning enabled Send');
    require(await action(
      'prefill'
    ).isDisabled(), 'Visible warning enabled prefilling');
    await panel.screenshot({
      path: 'docs/screenshots/issue-56-application-resume-visibility/mcp-after.png',
    });
    await page.reload();
    await state('resume-not-visible');
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Visibility recovery overflows phone');
    await panel.screenshot({
      path: 'docs/screenshots/issue-56-application-resume-visibility/mcp-phone.png',
    });
    await owner('hold-resume-clear', 'POST');
    await confirmed('read');
    await state('review');
    await panel
      .locator('[data-application-hold="resume-not-visible"]')
      .waitFor();
    await confirmed('prefill');
    const values = await owner('draft-values');
    require(values.experience === 'Owner-only questionnaire answer.' &&
      values.letter === 'Actual edited owner letter.' &&
      values.header ===
        'Owner header', 'Warning handling changed owner values');
    require(values.submissions === 0 &&
      values.entries === 1, 'Warning handling sent or replayed an application');
    await action('close').click();
    await state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      tools.errors.length === 0, 'Visibility fixture did not drain');
    return {
      renderedWarningBlocked: true,
      collapsedIgnored: true,
      reloadDidNotReplay: true,
      dismissalDoesNotSend: true,
      ownerValuesPreserved: true,
      phoneFits: true,
      providerSubmissions: values.submissions,
      browserClosed: stats.closed,
      errors: tools.errors,
    };
  });
