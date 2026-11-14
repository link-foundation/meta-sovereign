async (page) => {
  const base = new URL(page.url()).origin;
  const dir =
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-provider-choices';
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const result = [];
  for (const [layout, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/chat/7`);
    const prefilling = await page.evaluate(() => {
      const spec = globalThis.choiceSpec;
      const expected = globalThis.choiceControl({ spec, operation: 'read' });
      globalThis.choiceExpected = expected;
      return globalThis.choiceControl({
        spec,
        expected,
        operation: 'prefill',
        text: 'Yes.',
      });
    });
    if (!prefilling.prefilled) {
      throw new Error('Automatic prefill was not verified');
    }
    await page.locator('textarea').fill('Owner answer to review');
    await page.evaluate(() => globalThis.mountChoices());
    const refused = await page.evaluate(() => {
      const spec = globalThis.choiceSpec;
      const current = globalThis.choiceControl({ spec, operation: 'read' });
      globalThis.choiceExpected = current;
      return globalThis.choiceControl({
        spec,
        expected: current,
        operation: 'arm',
        token: 'mcp-option',
        option: 'Yes.',
      });
    });
    if (
      refused.code !== 'answer-draft-preserved' ||
      (await page.locator('textarea').inputValue()) !== 'Owner answer to review'
    ) {
      throw new Error('An owner draft was not preserved');
    }
    await page.screenshot({
      path: `${dir}/provider-choices-mcp-owner-${layout}.png`,
    });
    await page.locator('textarea').fill('');
    await page.screenshot({
      path: `${dir}/provider-choices-mcp-before-${layout}.png`,
    });
    const armed = await page.evaluate(() =>
      globalThis.choiceControl({
        spec: globalThis.choiceSpec,
        expected: globalThis.choiceExpected,
        operation: 'arm',
        token: 'mcp-option',
        option: 'Yes.',
      })
    );
    if (!armed.armed) {
      throw new Error(`Choice not armed: ${armed.code}`);
    }
    await page.locator(armed.selector).click();
    const receipt = await page.evaluate(() =>
      globalThis.choiceControl({
        spec: globalThis.choiceSpec,
        expected: globalThis.choiceExpected,
        operation: 'receipt',
        token: 'mcp-option',
        option: 'Yes.',
        finish: true,
      })
    );
    const counts = await page.evaluate(() => ({
      clicks: globalThis.fixture.clicks,
      text: globalThis.fixture.textSends,
    }));
    if (
      !receipt.sent ||
      receipt.messageId !== '102' ||
      counts.clicks !== 1 ||
      counts.text !== 0
    ) {
      throw new Error('The unique outgoing choice receipt was not verified');
    }
    await page.screenshot({
      path: `${dir}/provider-choices-mcp-after-${layout}.png`,
    });
    result.push({ layout, ownerPreserved: true, ...counts, receipt });
  }
  if (errors.length) {
    throw new Error(JSON.stringify(errors));
  }
  return { layouts: result, pageErrors: errors };
};
