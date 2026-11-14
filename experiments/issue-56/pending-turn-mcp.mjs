async (page, { prepareQuestionBrowserMcp }) => {
  const { control, controls, errors, read } =
    await prepareQuestionBrowserMcp(page);
  const seed = async () => {
    await page.request.get(`${control}/reset`);
    await page.request.get(`${control}/pending`);
    await read();
  };
  await seed();
  const turn = controls.locator(
    '[data-browser-answer-review] [data-browser-pending-turn]'
  );
  if ((await turn.locator('li').count()) !== 2) {
    throw new Error('Earlier pending message missing.');
  }
  await turn
    .getByText('What is your expected salary?', { exact: true })
    .waitFor();
  await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
  await controls.scrollIntoViewIfNeeded();
  const root =
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-pending-turn';
  await page.screenshot({ path: `${root}/pending-turn-mcp-desktop.png` });
  await page.request.get(`${control}/pending-edit`);
  await controls.locator('[data-browser-answer-select]').click();
  await controls.locator('[data-browser-answer-status="failed"]').waitFor();
  const refused = await (await page.request.get(control)).json();
  if (refused.clicks !== 0 || refused.textSends !== 0 || refused.draft !== '') {
    throw new Error('Stale context reached provider.');
  }
  await seed();
  await page.setViewportSize({ width: 390, height: 900 });
  await turn
    .getByText('What is your expected salary?', { exact: true })
    .waitFor();
  await controls.getByRole('radio', { name: 'Yes', exact: true }).check();
  await controls.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/pending-turn-mcp-mobile.png` });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ))
  ) {
    throw new Error('Mobile overflow.');
  }
  await controls.locator('[data-browser-answer-select]').click();
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  await controls
    .getByRole('button', { name: 'Recover selection status', exact: true })
    .click();
  await controls.locator('[data-browser-answer-status="sent"]').waitFor();
  const final = await (await page.request.get(control)).json();
  if (final.clicks !== 1 || final.textSends !== 0 || errors.length) {
    throw new Error('Unexpected provider action or page error.');
  }
  return {
    pendingMessages: 2,
    staleContextRefused: true,
    recoveredWithoutReplay: true,
    mobileWidth: 390,
    ...final,
    pageErrors: errors,
    liveProvider: false,
  };
};
