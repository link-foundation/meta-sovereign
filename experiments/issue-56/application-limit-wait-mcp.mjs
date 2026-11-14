async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { start, panel, owner, require, confirmed, action, page, errors } =
      tools;
    const restore = tools.source.searchParams.has('restore');
    const prefix = restore
      ? 'application-limit-restore'
      : 'application-limit-wait';
    await start();
    await owner('limit-edit', 'POST');
    if (restore) {
      await owner('limit-letter', 'POST');
    }
    await owner('limit-show', 'POST');
    await confirmed('read');
    require(await action(
      'wait-limit'
    ).isDisabled(), 'Waiting reused confirmation');
    await confirmed(restore ? 'wait-limit-restore' : 'wait-limit');
    await panel.locator('[data-application-limit-wait="waiting"]').waitFor();
    const deadline = await panel
      .locator('[data-application-limit-until]')
      .getAttribute('data-application-limit-until');
    await owner('limit-edit-later', 'POST');
    if (restore) {
      await owner('limit-letter-later', 'POST');
    }
    await page.waitForFunction(() =>
      document
        .querySelector('[data-application-draft]')
        ?.textContent.includes('Later native owner answer while waiting.')
    );
    await tools.locales('limit-wait="waiting"', 'submit');
    require((await panel
      .locator('[data-application-limit-until]')
      .getAttribute('data-application-limit-until')) ===
      deadline, 'Status recovery extended the original deadline');
    await panel.screenshot({
      path: `docs/screenshots/${prefix}-after-mcp-waiting.png`,
    });
    await page.setViewportSize({ width: 390, height: 1440 });
    require(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ), 'Waiting overflows the phone');
    await panel.screenshot({
      path: `docs/screenshots/${prefix}-after-mcp-phone.png`,
    });
    const counters = await owner('limit-values');
    require(counters.entries === 1 &&
      counters.sends === 0, 'Waiting repeated native entry or sent');
    await owner('limit-expire', 'POST');
    await panel.locator('[data-application-limit-wait="review"]').waitFor();
    require((await owner('limit-values')).experience ===
      (restore
        ? 'Later native owner answer while waiting.'
        : ''), 'Expiry did not honor restoration consent');
    await panel.screenshot({
      path: `docs/screenshots/${prefix}-after-mcp.png`,
    });
    if (!restore) {
      await confirmed('restore');
    }
    const restored = await owner('limit-values');
    if (restore) {
      require(restored.letter ===
        'Later owner letter while waiting.', 'Expiry lost the actual owner letter');
    }
    require(restored.experience ===
      'Later native owner answer while waiting.' &&
      restored.sends ===
        0, 'Separate restoration lost the later answer or sent');
    await action('close').click();
    await tools.state('closed');
    const stats = await owner('stats');
    require(stats.closed &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Daily wait did not drain');
    return {
      deadline,
      locales: 4,
      laterOwnerEditSaved: true,
      guardedRefreshes: 1,
      restorationSeparatelyConfirmed: !restore,
      restorationConfirmedWithWait: restore,
      sends: 0,
      entries: counters.entries,
      resourcesClosed: true,
      errors,
    };
  });
