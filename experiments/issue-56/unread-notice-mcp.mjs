import { prepareQuestionBrowserMcp } from './question-controls-mcp-setup.mjs';

const verifyMcpFailures = async ({
  page,
  unread,
  control,
  stats,
  mode,
  start,
  settled,
  recover,
  check,
  shot,
  cases,
}) => {
  await mode('unknown');
  await start(unread);
  await settled(unread, 'paused');
  check(
    (await unread.locator('[data-browser-unread-notice="unknown"]').count()) ===
      1,
    'Missing positive receipt must stay unknown.'
  );
  await recover(unread);
  check(
    (await stats()).sends === 2 && (await stats()).scans === 2,
    'Unknown recovery must not retry.'
  );
  await shot('unknown-desktop', unread);
  cases.push('uncertain-outcome-holds-without-replay');
  await mode('owner');
  await start(unread);
  await settled(unread, 'failed');
  check(
    (await unread.locator('[data-browser-unread-notice="sent"]').count()) === 1,
    'Later owner return must preserve actual delivery.'
  );
  await unread
    .getByText(
      'The original view could not be fully restored. Check the provider window; newer owner changes were preserved.',
      { exact: true }
    )
    .waitFor();
  await shot('owner-return-desktop', unread);
  cases.push('confirmed-send-with-unrestored-owner-view');
  await mode('stop');
  await start(unread);
  await settled(unread, 'active');
  // Selecting is flushed before issue; observe the counted issue boundary too.
  for (
    let attempt = 0;
    attempt < 100 && (await stats()).pending !== 1;
    attempt++
  ) {
    await page.waitForTimeout(20);
  }
  check((await stats()).pending === 1, 'The issued effect did not start.');
  await unread
    .getByRole('button', { name: 'Stop unread pass and wait', exact: true })
    .click();
  check((await stats()).pending === 1, 'Stop must await the issued receipt.');
  await page.request.get(`${control}/release`);
  await settled(unread, 'stopped');
  check((await stats()).pending === 0, 'Stop must drain the borrowed visit.');
  check(
    (await unread.locator('[data-browser-unread-notice="sent"]').count()) === 1,
    'Stop must retain positive issued delivery.'
  );
  await shot('stopped-desktop', unread);
  cases.push('stop-drains-positive-issued-reply');
};

const verifyMcpSurfaces = async ({
  page,
  base,
  control,
  stats,
  start,
  settled,
  recover,
  open,
  check,
  shot,
  cases,
}) => {
  for (const [surface, hash, width] of [
    ['chat', '#chat=hh:7', 1180],
    ['operator', '#/operator?chat=hh%3A7', 390],
  ]) {
    await page.request.get(`${control}/seed`);
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`${base}/?notice-surface=${surface}${hash}`);
    await page.locator('[data-action="chat-automations"]').click();
    const menu = page.locator('.chat-menu-list [data-browser-answer-controls]');
    await open(menu);
    const pass = menu.locator('[data-browser-unread-controls]');
    if (surface === 'operator') {
      await recover(pass);
      await settled(pass, 'completed');
      check(
        (await stats()).sends === 5 && (await stats()).scans === 5,
        'Cross-surface recovery must be read-only.'
      );
    }
    await start(pass);
    await settled(pass, 'completed');
    check(
      (await pass.locator('[data-browser-unread-notice="sent"]').count()) === 1,
      'Shared controls must retain actual receipts.'
    );
    check(
      (await stats()).sends === 5,
      'Shared reservations must block a duplicate notice.'
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'Viewport overflow.'
    );
    await shot(surface, pass);
    cases.push(`${surface}-explicit-policies-and-shared-reservations`);
  }
};

const inspectUnreadNotices = async (page) => {
  const base = new URL(page.url()).origin;
  page.setDefaultTimeout(10000);
  await page.addInitScript(() =>
    globalThis.localStorage.setItem(
      'metaSovereignOperatorScope',
      JSON.stringify({ private: true, bot: true })
    )
  );
  const { control, controls, errors } = await prepareQuestionBrowserMcp(page);
  const check = (ok, message) => {
    if (!ok) {
      throw new Error(message);
    }
  };
  const open = async (node) => {
    if (!(await node.evaluate((element) => element.open))) {
      await node.locator(':scope > summary').click();
    }
  };
  const stats = async () => (await page.request.get(control)).json();
  const mode = (value) => page.request.get(`${control}/mode?value=${value}`);
  const shot = async (name, node) => {
    await node.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-unread-notices/mcp-${name}.png`,
    });
  };
  const start = async (node) => {
    await node.locator('[data-browser-unread-notices]').check();
    await node.locator('[data-browser-unread-confirm]').check();
    await node.locator('[data-browser-unread-start]').click();
  };
  const settled = (node, state) =>
    node.locator(`[data-browser-unread-result="${state}"]`).waitFor();
  const recover = (node) =>
    node
      .getByRole('button', { name: 'Recover unread pass status', exact: true })
      .click();
  const cases = [];
  const panel = page.locator('[data-question-controls]');
  const unread = controls.locator('[data-browser-unread-controls]');
  check(
    !(await unread.locator('[data-browser-unread-notices]').isChecked()),
    'Notice sending must default off.'
  );
  check((await stats()).scans === 0, 'Rendering must not traverse.');
  await start(unread);
  await settled(unread, 'completed');
  await page.reload();
  await open(panel);
  await open(controls);
  await recover(unread);
  await settled(unread, 'completed');
  check(
    (await unread.locator('[data-browser-unread-notice="sent"]').count()) === 1,
    'Require actual positive delivery.'
  );
  check(
    (await stats()).sends === 1 && (await stats()).scans === 1,
    'Reload/recovery must never send or traverse again.'
  );
  await shot('confirmed-desktop', unread);
  cases.push('confirmed-reply-reload-without-replay');
  const context = {
    page,
    unread,
    base,
    control,
    stats,
    mode,
    start,
    settled,
    recover,
    open,
    check,
    shot,
    cases,
  };
  await verifyMcpFailures(context);
  await mode('normal');
  await verifyMcpSurfaces(context);
  check(errors.length === 0, errors.join('\n'));
  return { cases, pageErrors: errors, ...(await stats()) };
};

export const unreadNoticeMcpCode = () =>
  `async (page) => {
const prepareQuestionBrowserMcp = ${prepareQuestionBrowserMcp.toString()};
const verifyMcpFailures = ${verifyMcpFailures.toString()};
const verifyMcpSurfaces = ${verifyMcpSurfaces.toString()};
return (${inspectUnreadNotices.toString()})(page);
}`;
