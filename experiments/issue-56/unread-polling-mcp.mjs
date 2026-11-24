import { prepareQuestionBrowserMcp } from './question-controls-mcp-setup.mjs';

const inspect = async (page, screenshots) => {
  const { controls, errors, stats, check, shot, unreadSurface } =
    await prepareQuestionBrowserMcp(page, { screenshots });
  const cases = [];
  const unread = controls.locator('[data-browser-unread-controls]');
  await unread.locator('[data-browser-unread-polling]').check();
  await unread
    .locator('[data-browser-unread-poll-field="intervalMs"]')
    .fill('1');
  await unread
    .locator('[data-browser-unread-poll-field="durationMs"]')
    .fill('2');
  check(
    await unread.locator('[data-browser-unread-start]').isDisabled(),
    'Repeated checks need mark-read confirmation'
  );
  check((await stats()).scans === 0, 'No native boundary before confirmation');
  cases.push('explicit-confirmation');
  await page.route(
    '**/api/automations/answers/browser/unread-start',
    async (route) => {
      await route.fetch();
      await route.abort('failed');
    }
  );
  const lost = page.waitForEvent('requestfailed', {
    predicate: (request) =>
      new URL(request.url()).pathname.endsWith('/unread-start'),
  });
  await unread.locator('[data-browser-unread-confirm]').check();
  await unread.locator('[data-browser-unread-start]').click();
  await lost;
  await unread
    .getByText(
      'Recover the saved pass before starting another. Recovery does not open chats again.',
      { exact: true }
    )
    .waitFor();
  await page.unroute('**/api/automations/answers/browser/unread-start');
  await unread
    .getByRole('button', { name: 'Recover unread pass status', exact: true })
    .click();
  await unread.getByText(/^Settled passes: [2-9]\./u).waitFor();
  await shot('waiting', unread);
  cases.push('lost-response-recovers-the-existing-polling-owner');
  await unread
    .getByRole('button', { name: 'Stop unread pass and wait', exact: true })
    .click();
  await unread.locator('[data-browser-unread-result="stopped"]').waitFor();
  const stopped = await stats();
  check(
    stopped.scans >= 2 && !stopped.sends && !stopped.pending,
    'Stop retains at least two settled read-only passes'
  );
  cases.push('stop-drains-repeated-checks');
  for (const [surface, hash, width] of [
    ['chat', '#chat=hh:7', 1180],
    ['operator', '#/operator?chat=hh%3A7', 390],
  ]) {
    const shared = await unreadSurface(surface, hash, width);
    await shared
      .getByRole('button', { name: 'Recover unread pass status', exact: true })
      .click();
    await shared.locator('[data-browser-unread-result="stopped"]').waitFor();
    check(
      (await stats()).scans === stopped.scans,
      'Recovery must not start another child'
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'No viewport overflow'
    );
    await shot(surface, shared);
    cases.push(`${surface}-shared-read-only-recovery`);
  }
  check(!errors.length, errors.join(', '));
  const final = await stats();
  check(
    !final.sends && !final.prefills && !final.reads && !final.pending,
    'No hidden sends, prefill or current-chat reads'
  );
  return { cases, pageErrors: errors, ...final };
};

export const unreadPollingMcpCode = () => `async (page) => {
  const prepareQuestionBrowserMcp = (${prepareQuestionBrowserMcp.toString()});
  return (${inspect.toString()})(page, ${JSON.stringify(`${process.cwd()}/docs/screenshots/issue-56-unread-polling`)});
}`;
