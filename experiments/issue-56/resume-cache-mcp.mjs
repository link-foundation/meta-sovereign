async (originalPage, fixture) =>
  fixture(originalPage, async (tools) => {
    const { page, owner, require, errors } = tools;
    const panel = page.locator('[data-vacancies]');
    const rows = panel.locator('[data-vacancy-resume]');
    const action = panel.locator('[data-vacancy-action="resumes"]');
    await action.click();
    await rows.nth(2).waitFor();
    require((await rows.count()) === 3, 'Native list was incomplete');
    await owner('fail-next', 'POST');
    await action.click();
    await panel.locator('[data-vacancy-error]').waitFor();
    require((await rows.count()) === 3, 'Mounted list lost acknowledged state');
    const baseline = await owner('stats');
    for (const [name, width] of [
      ['after-mcp', 1280],
      ['phone-mcp', 390],
    ]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.reload();
      await rows.nth(2).waitFor();
      await rows.first().scrollIntoViewIfNeeded();
      require((await rows.count()) === 3 &&
        !(await panel.innerText()).includes(
          'Unacknowledged CV'
        ), 'Reload exposed refused data');
      require(await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ), 'Phone overflow');
      await page.screenshot({
        path: `docs/screenshots/resume-cache-${name}.png`,
      });
    }
    const stats = await owner('stats');
    require(stats.opens === baseline.opens &&
      stats.closed &&
      stats.failedSaves === 1 &&
      stats.providerClicks === 0 &&
      stats.pageErrors.length === 0 &&
      errors.length === 0, 'Recovery replayed work or failed to drain');
    return {
      resumeRows: 3,
      rejectedWrites: 1,
      providerClicks: 0,
      recoveryReplayed: false,
      phone: true,
      resourcesClosed: true,
      errors,
    };
  });
