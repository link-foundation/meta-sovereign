async (originalPage) => {
  const browser = originalPage.context().browser();
  const input = new URL(originalPage.url());
  const base = input.origin;
  const form = input.searchParams.get('fixture');
  let page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((entry) => entry !== originalPage && entry.url().startsWith(base));
  if (!page) {
    for (const context of browser.contexts()) {
      if (context !== originalPage.context()) {
        await context.close();
      }
    }
    const context = await browser.newContext();
    page = await context.newPage();
    await page.addInitScript(() => {
      for (const [key, value] of Object.entries({
        metaSovereignLocale: 'en',
        metaSovereignTutorial: JSON.stringify({ off: true, v: 5 }),
      })) {
        globalThis.localStorage.setItem(key, value);
      }
    });
    await page.goto(`${base}/#/forms`);
    await page.locator('[data-form-url]').fill(form);
    await page.locator('[data-form-slot]').fill('captcha-controls');
    await page.locator('[data-action="open-form-review"]').click();
    await page.locator('[data-review-action="read"]').click();
    await page
      .locator('[data-form-profile]')
      .selectOption('qa-profile:forms-fixture');
    await page.evaluate(() => {
      for (const name of ['formsPrefillReview', 'formsPrefillStatus']) {
        const original = globalThis.__msApi[name];
        globalThis.__msApi[name] = async (input) => {
          const result = await original(input);
          globalThis.__cleanupReceipt = result;
          return result;
        };
      }
    });
    await page.locator('[data-action="prefill-form"]').click();
    const waiting = page.locator(
      '[data-form-automatic-result="waiting-owner"]'
    );
    await waiting.waitFor();
    await waiting.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-prefill-cleanup/mcp-waiting.png',
    });
    return {
      state: 'waiting-owner',
      closeEnabled: await page
        .locator('[data-review-action="close"]')
        .isEnabled(),
      overlay: await page.locator('[data-tutorial-overlay]').count(),
    };
  }
  const completed = page.locator('[data-form-automatic-result="prefilled"]');
  await completed.waitFor();
  for (const [name, width, height] of [
    ['desktop', 1200, 800],
    ['phone', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await completed.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => globalThis.scrollBy(0, -72));
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > globalThis.innerWidth
      )
    ) {
      throw new Error('Completed prefill overflows viewport');
    }
    await page.screenshot({
      path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-prefill-cleanup/mcp-completed-${name}.png`,
    });
  }
  const result = await page.evaluate(() => {
    const value = globalThis.__cleanupReceipt;
    return {
      state: value.state,
      ok: value.ok,
      complete: value.complete,
      receipts: value.receipts.length,
      submissionAttempted: value.submissionAttempted,
    };
  });
  if (
    !result.ok ||
    !result.complete ||
    result.receipts !== 1 ||
    result.submissionAttempted
  ) {
    throw new Error('Expected the exact completed receipt');
  }
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  await page.context().close();
  return { ...result, closed: true };
};
