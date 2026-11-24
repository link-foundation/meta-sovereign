/* global history */
async (page) => {
  const base = new URL(page.url()).origin;
  const config = await (await page.request.get(`${base}/spec.json`)).json();
  const frameHtml = await (await page.request.get(`${base}/frame`)).text();
  const applicationHtml = await (
    await page.request.get(`${base}/application`)
  ).text();
  // Only the locally bundled application module becomes code.
  const { resolveBrowserChoiceDocument } = new Function(
    `${config.documentCode}; return ChoiceDocuments;`
  )();
  const context = page.context();
  await context.route('https://**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: new URL(route.request().url()).pathname.startsWith('/chat/')
        ? frameHtml
        : applicationHtml,
    })
  );
  const dir =
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-hh-choices';
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const layouts = [];
  try {
    for (const [layout, width, height] of [
      ['desktop', 1200, 950],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto('https://hh.ru/vacancy/42');
      const frame = page
        .frames()
        .find((item) => item.url() === 'https://chatik.hh.ru/chat/7');
      const held = await resolveBrowserChoiceDocument(
        {},
        page,
        config.spec,
        '7'
      );
      const evaluate = (input) =>
        held.evaluate({
          fn: (value) => globalThis.choiceControl(value),
          args: [{ spec: config.spec, ...input }],
        });
      let expected = await evaluate({ operation: 'read' });
      const prefill = await evaluate({
        operation: 'prefill',
        expected,
        text: 'Owned automatic draft',
      });
      if (!prefill.prefilled) {
        throw new Error('Frame prefill failed');
      }
      await frame.locator('textarea').fill('Owner answer to review');
      await frame.evaluate(() => globalThis.mountChoices());
      expected = await evaluate({ operation: 'read' });
      const refused = await evaluate({
        operation: 'arm',
        expected,
        token: 'mcp-hh-choice',
        option: 'Yes.',
      });
      if (
        refused.code !== 'answer-draft-preserved' ||
        (await frame.locator('textarea').inputValue()) !==
          'Owner answer to review'
      ) {
        throw new Error('Owner frame draft changed');
      }
      await page.screenshot({
        path: `${dir}/hh-choices-mcp-owner-${layout}.png`,
        fullPage: true,
      });
      await frame.locator('textarea').fill('');
      await page.screenshot({
        path: `${dir}/hh-choices-mcp-before-${layout}.png`,
        fullPage: true,
      });
      const armed = await evaluate({
        operation: 'arm',
        expected,
        token: 'mcp-hh-choice',
        option: 'Yes.',
      });
      if (!armed.armed) {
        throw new Error(`Choice failed: ${armed.code}`);
      }
      await held.clickButton({ selector: armed.selector });
      const receipt = await evaluate({
        operation: 'receipt',
        expected,
        token: 'mcp-hh-choice',
        option: 'Yes.',
        finish: true,
      });
      const counts = await frame.evaluate(() => ({
        clicks: globalThis.fixture.clicks,
        text: globalThis.fixture.textSends,
      }));
      if (
        !receipt.sent ||
        receipt.messageId !== '102' ||
        counts.clicks !== 1 ||
        counts.text !== 0
      ) {
        throw new Error('Native frame receipt failed');
      }
      await page.screenshot({
        path: `${dir}/hh-choices-mcp-after-${layout}.png`,
        fullPage: true,
      });
      await page.evaluate(() => history.replaceState(null, '', '/vacancy/43'));
      let rejected = false;
      try {
        await evaluate({ operation: 'read' });
      } catch {
        rejected = true;
      }
      if (!rejected) {
        throw new Error('Owner navigation retained stale frame authority');
      }
      layouts.push({
        layout,
        receipt,
        ...counts,
        ownerPreserved: true,
        navigationRefused: true,
      });
    }
    if (errors.length) {
      throw new Error(JSON.stringify(errors));
    }
    return { layouts, pageErrors: errors, liveProvider: false };
  } finally {
    await context.unroute('https://**/*');
  }
};
