Object.assign(
  async function verifyReviewedText(page) {
    const base = new URL(page.url()).origin;
    const control = new URL(page.url()).searchParams.get('fixtureControl');
    if (!control || new URL(control).hostname !== '127.0.0.1') {
      throw new Error(
        'Open the private fixture with its loopback control URL.'
      );
    }
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        JSON.stringify({ off: true, v: 5 })
      );
      globalThis.localStorage.setItem(
        'metaSovereignOperatorScope',
        JSON.stringify({ private: true, bot: true })
      );
    });
    const root =
      '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-question-text-ui';
    let controls;
    const open = async (node) => {
      if (!(await node.evaluate((element) => element.open))) {
        await node.locator(':scope > summary').click();
      }
    };
    const read = async () => {
      const review = controls.locator('[data-browser-answer-review]');
      const previous = (await review.count())
        ? await review.getAttribute('data-browser-answer-review')
        : null;
      await controls
        .getByLabel('Web-chat reference', { exact: true })
        .fill('7');
      await controls.locator('[data-browser-answer-inspect]').click();
      await controls
        .locator(
          previous
            ? `[data-browser-answer-review]:not([data-browser-answer-review="${previous}"])`
            : '[data-browser-answer-review]'
        )
        .waitFor();
    };
    const field = () =>
      controls.getByRole('textbox', { name: 'Reply text', exact: true });
    const send = () =>
      controls.getByRole('button', {
        name: 'Send reviewed text reply',
        exact: true,
      });
    const stats = async () => (await page.request.get(control)).json();
    const count = async (expected) => {
      const value = await stats();
      if (
        value.textReplies !== expected ||
        value.ordinarySends !== 0 ||
        value.prefills !== 0
      ) {
        throw new Error(
          `Unexpected sender-stub effects: ${JSON.stringify(value)}`
        );
      }
    };
    const results = [];
    await page.setViewportSize({ width: 1180, height: 950 });
    await page.goto(`${base}/#/automation`);
    await open(page.locator('[data-question-controls]'));
    controls = page.locator(
      '[data-question-controls] [data-browser-answer-controls]'
    );
    await open(controls);
    await read();
    await controls
      .getByText('Pending rendered messages: 2', { exact: true })
      .waitFor();
    await field().fill(
      'Expected salary: 100000. I have distributed systems experience.'
    );
    await count(0);
    await field().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${root}/mcp-review-desktop.png` });
    results.push('whole-turn-edit-without-delivery');
    await page.reload();
    await open(page.locator('[data-question-controls]'));
    await open(controls);
    await field().waitFor();
    if (!(await field().inputValue()).startsWith('Expected salary: 100000.')) {
      throw new Error('Unsent draft was lost');
    }
    await count(0);
    results.push('unsent-draft-reload');
    await send().click();
    await controls.locator('[data-browser-answer-status="sent"]').waitFor();
    await controls
      .getByText('The provider confirmed this text reply.', { exact: true })
      .waitFor();
    await count(1);
    await page.reload();
    await open(page.locator('[data-question-controls]'));
    await open(controls);
    await controls.locator('[data-browser-answer-status="sent"]').waitFor();
    if (!(await send().isDisabled())) {
      throw new Error('Confirmed reply can replay');
    }
    await count(1);
    results.push('confirmed-receipt-reload');
    await verifyReviewedText.recovery({
      page,
      base,
      control,
      controls,
      read,
      field,
      send,
      count,
      stats,
      open,
      root,
      results,
      setControls: (value) => {
        controls = value;
      },
    });
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }
    return { cases: results, pageErrors: errors, ...(await stats()) };
  },
  {
    recovery: async ({
      page,
      base,
      control,
      controls: initialControls,
      read,
      field,
      send,
      count,
      stats,
      open,
      root,
      results,
      setControls,
    }) => {
      let controls = initialControls;
      await page.request.get(`${control}/reset?mode=owner`);
      await read();
      if (
        !(await field().isDisabled()) ||
        !(await send().isDisabled()) ||
        (await stats()).ownerDraft !== 'Keep my own draft'
      ) {
        throw new Error('Owner draft is not protected');
      }
      results.push('owner-draft');
      await page.request.get(`${control}/reset?mode=unknown`);
      await read();
      await field().fill('Uncertain reply remains held');
      await send().click();
      await controls
        .locator('[data-browser-answer-status="unknown"]')
        .waitFor();
      await page.reload();
      await open(page.locator('[data-question-controls]'));
      await open(controls);
      await controls
        .locator('[data-browser-answer-status="unknown"]')
        .waitFor();
      if (!(await send().isDisabled())) {
        throw new Error('Uncertain reply can replay');
      }
      await count(1);
      results.push('uncertain-reply-reload');
      for (const [surface, hash, width] of [
        ['chat', '#chat=hh:7', 1180],
        ['operator', '#/operator?chat=hh%3A7', 390],
      ]) {
        await page.request.get(`${control}/reset`);
        await page.setViewportSize({ width, height: 950 });
        await page.goto(`${base}/?mcp-text=${surface}${hash}`);
        await page.locator('[data-action="chat-automations"]').click();
        controls = page.locator(
          '.chat-menu-list [data-browser-answer-controls]'
        );
        setControls(controls);
        await open(controls);
        await read();
        await field().fill(`${surface}: explicitly reviewed text`);
        await count(0);
        await send().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${root}/mcp-review-${surface}.png` });
        await send().click();
        await controls.locator('[data-browser-answer-status="sent"]').waitFor();
        await count(1);
        if (
          !(await page.evaluate(
            () => document.documentElement.scrollWidth <= globalThis.innerWidth
          ))
        ) {
          throw new Error('Viewport overflow');
        }
        results.push(`${surface}-shared-text-controls`);
      }
    },
  }
);
