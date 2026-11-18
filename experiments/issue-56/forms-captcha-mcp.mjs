async (page) => {
  const capture = async (state) => {
    const result = page.locator(`[data-form-automatic-result="${state}"]`);
    for (const [name, width, height] of [
      ['desktop', 1200, 800],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await result.evaluate((node) => node.scrollIntoView({ block: 'end' }));
      if (state === 'waiting-owner') {
        await page.waitForFunction(() => {
          const box = document
            .querySelector('[data-form-automatic-result]')
            .getBoundingClientRect();
          const clearance =
            (document.querySelector('.bottom-nav')?.getBoundingClientRect()
              .height ?? 0) + 16;
          if (box.bottom > globalThis.innerHeight - clearance + 1) {
            globalThis.scrollBy({
              top: box.bottom - globalThis.innerHeight + clearance,
              behavior: 'instant',
            });
            return false;
          }
          return true;
        });
      }
      if (state !== 'waiting-owner') {
        await result.evaluate((node) =>
          node.scrollIntoView({ block: 'start' })
        );
        await page.evaluate(() => globalThis.scrollBy(0, -72));
      }
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > globalThis.innerWidth
        )
      ) {
        throw new Error('Manual verification overflows the viewport.');
      }
      await page.screenshot({
        path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-forms-captcha-mcp-${state}-${name}.png`,
      });
    }
  };
  const waitingProof = async () => ({
    state: await page
      .locator('[data-form-automatic-result]')
      .getAttribute('data-form-automatic-result'),
    closeEnabled: await page
      .locator('[data-review-action="close"]')
      .isEnabled(),
    ownerActionRequired: (
      await page.locator('[data-form-automatic-result]').innerText()
    ).includes('Waiting for you to solve verification'),
  });
  if (
    await page.locator('[data-form-automatic-result="waiting-owner"]').count()
  ) {
    await capture('waiting-owner');
    return waitingProof();
  }
  if ((await page.locator('[data-form-review]').count()) === 0) {
    const location = new URL(page.url());
    const form = location.searchParams.get('fixture');
    if (!form) {
      throw new Error('Supply the isolated form in ?fixture=.');
    }
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.goto(`${location.origin}/#/forms`);
    await page.locator('[data-form-url]').fill(form);
    await page.locator('[data-form-slot]').fill('captcha-controls');
    await page.locator('[data-action="open-form-review"]').click();
    await page.locator('[data-review-action="read"]').click();
    await page
      .locator('[data-form-profile]')
      .selectOption('qa-profile:forms-fixture');
    await page.evaluate(() => {
      const api = globalThis.__msApi;
      for (const name of ['formsPrefillReview', 'formsPrefillStatus']) {
        const original = api[name];
        api[name] = async (input) => {
          const result = await original(input);
          globalThis.__captchaMcpReceipt = result;
          return result;
        };
      }
    });
    await page.locator('[data-action="prefill-form"]').click();
    await page
      .locator('[data-form-automatic-result="waiting-owner"]')
      .waitFor();
    await capture('waiting-owner');
    return waitingProof();
  }
  await page.locator('[data-form-automatic-result="prefilled"]').waitFor();
  await capture('prefilled');
  const proof = await page.evaluate(() => {
    const result = globalThis.__captchaMcpReceipt;
    return {
      state: result.state,
      complete: result.complete,
      receipts: result.receipts.length,
      submissionAttempted: result.submissionAttempted,
    };
  });
  if (!proof.complete || proof.receipts !== 1 || proof.submissionAttempted) {
    throw new Error('Expected one verified answer after manual completion.');
  }
  await page.locator('[data-review-action="close"]').click();
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return { ...proof, closed: true };
};
