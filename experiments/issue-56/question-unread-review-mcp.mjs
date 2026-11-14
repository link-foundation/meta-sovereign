const verifyRecovery = async ({
  page,
  unread,
  start,
  controls,
  open,
  stats,
  check,
  results,
}) => {
  await page.route(
    '**/api/automations/answers/browser/unread-start',
    async (route) => {
      await route.fetch();
      await route.abort('failed');
    }
  );
  await start.click();
  await unread
    .getByText(
      'Recover the saved pass before starting another. Recovery does not open chats again.',
      { exact: true }
    )
    .waitFor();
  check(await start.isDisabled(), 'Lost-response start is locked.');
  check(
    (await unread.locator('[data-browser-unread-result]').count()) === 0,
    'A new pass must not show old completion.'
  );
  await page.unroute('**/api/automations/answers/browser/unread-start');
  await page.reload();
  await open(page.locator('[data-question-controls]'));
  await open(controls);
  await unread
    .getByRole('button', { name: 'Recover unread pass status', exact: true })
    .click();
  await unread.locator('[data-browser-unread-result="completed"]').waitFor();
  check(
    (await stats()).scans === 2,
    'Reload/recovery must not repeat mark-read.'
  );
  results.push('lost-start-response-reload-recovery');
};

const verifySurfaces = async ({
  page,
  base,
  control,
  open,
  stats,
  check,
  shot,
  results,
}) => {
  for (const [surface, hash, width] of [
    ['chat', '#chat=hh:7', 1180],
    ['operator', '#/operator?chat=hh%3A7', 390],
  ]) {
    await page.request.get(`${control}/seed`);
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`${base}/?mcp-unread=${surface}${hash}`);
    await page.locator('[data-action="chat-automations"]').click();
    const menu = page.locator('.chat-menu-list [data-browser-answer-controls]');
    await open(menu);
    const pass = menu.locator('[data-browser-unread-controls]');
    if (surface === 'operator') {
      await pass
        .getByRole('button', {
          name: 'Recover unread pass status',
          exact: true,
        })
        .click();
      await pass.locator('[data-browser-unread-result="completed"]').waitFor();
      check(
        (await stats()).scans === 5,
        'Cross-surface recovery must not scan.'
      );
    }
    await pass.locator('[data-browser-unread-confirm]').check();
    await pass.locator('[data-browser-unread-start]').click();
    await pass.locator('[data-browser-unread-result="completed"]').waitFor();
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'Viewport overflow.'
    );
    await shot(surface, pass);
    results.push(`${surface}-shared-controls`);
  }
};

export const verifyUnreadMcp = async (page) => {
  const initial = new URL(page.url());
  const base = initial.origin;
  const control = initial.searchParams.get('fixtureControl');
  if (!control || new URL(control).hostname !== '127.0.0.1') {
    throw new Error('Open the private loopback fixture first.');
  }
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    (settings) => {
      for (const [key, value] of Object.entries(settings)) {
        globalThis.localStorage.setItem(key, value);
      }
    },
    {
      metaSovereignLocale: 'en',
      metaSovereignTutorial: JSON.stringify({ off: true, v: 5 }),
      metaSovereignOperatorScope: JSON.stringify({ private: true, bot: true }),
    }
  );
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const results = [];
  const open = async (node) => {
    if (!(await node.evaluate((element) => element.open))) {
      await node.locator(':scope > summary').click();
    }
  };
  const stats = async () => (await page.request.get(control)).json();
  const shot = async (name, node) => {
    await node.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-question-unread-review/mcp-${name}.png`,
    });
  };
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.goto(`${base}/#/automation`);
  await open(page.locator('[data-question-controls]'));
  const controls = page.locator(
    '[data-question-controls] [data-browser-answer-controls]'
  );
  await open(controls);
  const unread = controls.locator('[data-browser-unread-controls]');
  const start = unread.locator('[data-browser-unread-start]');
  check(await start.isDisabled(), 'Mark-read consent is required.');
  check((await stats()).scans === 0, 'Consent must precede traversal.');
  await unread.locator('[data-browser-unread-confirm]').check();
  await start.click();
  await unread.locator('[data-browser-unread-result="completed"]').waitFor();
  await unread.locator('[data-browser-unread-review="8"]').click();
  await controls
    .locator('[data-browser-answer-review] pre')
    .filter({ hasText: 'Yes' })
    .waitFor();
  check((await stats()).scans === 1, 'Review must not traverse again.');
  await shot('review-desktop', unread);
  results.push('confirmation-and-frozen-review');
  await verifyRecovery({
    page,
    unread,
    start,
    controls,
    open,
    stats,
    check,
    results,
  });
  await page.request.get(`${control}/mode?value=stop`);
  await unread.locator('[data-browser-unread-confirm]').check();
  await start.click();
  await unread.locator('[data-browser-unread-result="active"]').waitFor();
  await unread
    .getByRole('button', { name: 'Stop unread pass and wait', exact: true })
    .click();
  await unread.locator('[data-browser-unread-result="stopped"]').waitFor();
  check(
    (await stats()).pending === 0,
    'Stop must drain the provider boundary.'
  );
  await shot('stopped-desktop', unread);
  results.push('stop-drains-pending-read');
  await page.request.get(`${control}/mode?value=owner`);
  await start.click();
  await unread.locator('[data-browser-unread-result="failed"]').waitFor();
  await unread
    .getByText(
      'The original view could not be fully restored. Check the provider window; newer owner changes were preserved.',
      { exact: true }
    )
    .waitFor();
  await shot('owner-return-desktop', unread);
  results.push('owner-return-is-not-restored');
  await page.request.get(`${control}/mode?value=normal`);
  await verifySurfaces({
    page,
    base,
    control,
    open,
    stats,
    check,
    shot,
    results,
  });
  const final = await stats();
  check(
    final.scans === 6 &&
      final.pending === 0 &&
      final.sends === 0 &&
      final.prefills === 0 &&
      final.reads === 0,
    'Unexpected provider effects.'
  );
  check(errors.length === 0, errors.join('\n'));
  return { cases: results, pageErrors: errors, ...final };
};
