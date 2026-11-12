import { prepareQuestionBrowserMcp } from './question-controls-mcp-setup.mjs';

const inspect = async (page, screenshots) => {
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
  const stats = async () => (await page.request.get(control)).json();
  const open = async (node) => {
    if (!(await node.evaluate((element) => element.open))) {
      await node.locator(':scope > summary').click();
    }
  };
  const start = async (node) => {
    await node.locator('[data-browser-unread-notices]').check();
    await node.locator('[data-browser-unread-confirm]').check();
    await node.locator('[data-browser-unread-start]').click();
    await node.locator('[data-browser-unread-result="completed"]').waitFor();
  };
  const recover = async (node) => {
    await node
      .getByRole('button', { name: 'Recover unread pass status', exact: true })
      .click();
    await node.locator('[data-browser-unread-result="completed"]').waitFor();
  };
  const shot = async (name, node) => {
    await node.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/mcp-${name}.png` });
  };
  const cases = [];
  const unread = controls.locator('[data-browser-unread-controls]');
  await start(unread);
  await unread
    .getByText('Confirmed reply 708 was revealed', { exact: false })
    .waitFor();
  check((await stats()).sends === 1, 'One actual counted positive send');
  await shot('revealed', unread);
  cases.push('confirmed-reply-visibility-disclosed');
  await page.reload();
  await open(page.locator('[data-question-controls]'));
  await open(controls);
  await recover(unread);
  await unread
    .getByText('Confirmed reply 708 was revealed', { exact: false })
    .waitFor();
  check(
    (await stats()).scans === 1 && (await stats()).sends === 1,
    'Recovery must not replay'
  );
  cases.push('read-only-reload-recovery');
  await page.request.get(`${control}/mode?value=unavailable`);
  await start(unread);
  await unread
    .getByText('Reply 808 was confirmed, but was not revealed.', {
      exact: false,
    })
    .waitFor();
  check(
    (await unread.locator('[data-browser-unread-notice="sent"]').count()) === 1,
    'View failure must retain confirmed delivery'
  );
  await shot('unavailable', unread);
  cases.push('unavailable-view-retains-positive-delivery');
  for (const [surface, hash, width] of [
    ['chat', '#chat=hh:7', 1180],
    ['operator', '#/operator?chat=hh%3A7', 390],
  ]) {
    await page.request.get(`${control}/seed`);
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`${base}/?reply-view-${surface}${hash}`);
    await page.locator('[data-action="chat-automations"]').click();
    const menu = page.locator('.chat-menu-list [data-browser-answer-controls]');
    await open(menu);
    const pass = menu.locator('[data-browser-unread-controls]');
    await recover(pass);
    await pass
      .getByText('Reply 808 was confirmed, but was not revealed.', {
        exact: false,
      })
      .waitFor();
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'Viewport overflow'
    );
    await shot(surface, pass);
    cases.push(`${surface}-shared-recovery`);
  }
  check(!errors.length, `Page errors: ${errors.join(', ')}`);
  const final = await stats();
  check(
    final.scans === 2 &&
      final.sends === 2 &&
      !final.pending &&
      !final.prefills &&
      !final.reads,
    'No recovery side effects'
  );
  return { cases, ...final, pageErrors: errors };
};

export const unreadReplyViewMcpCode = () => `async (page) => {
  const prepareQuestionBrowserMcp = (${prepareQuestionBrowserMcp.toString()});
  return (${inspect.toString()})(page, ${JSON.stringify(`${process.cwd()}/docs/screenshots/issue-56-unread-reply-view`)});
}`;
