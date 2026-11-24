async (page, { prepareQuestionBrowserMcp, waitForQuestionPrefill }) => {
  const { control, controls, errors, read } =
    await prepareQuestionBrowserMcp(page);
  const seed = async () => {
    const response = await page.request.get(`${control}/whole-turn`);
    if (!response.ok()) {
      throw new Error('Private fixture preparation failed.');
    }
    await read();
  };
  await seed();
  const expected = '1. My English level is B2.\n2. Yes';
  const draft = controls.locator('[data-browser-answer-review] > pre');
  const prefill = controls.getByRole('button', {
    name: 'Prefill the reviewed draft',
    exact: true,
  });
  if ((await draft.textContent()) !== expected) {
    throw new Error('The pending draft omitted an answer.');
  }
  const root =
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-whole-turn';
  await controls.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/whole-turn-mcp-desktop.png` });
  await prefill.click();
  await waitForQuestionPrefill(controls);
  await controls
    .getByRole('button', { name: 'Recover selection status', exact: true })
    .click();
  await waitForQuestionPrefill(controls);
  const filled = await (await page.request.get(control)).json();
  if (filled.clicks || filled.textSends || filled.draft !== expected) {
    throw new Error('The whole draft was not preserved through recovery.');
  }
  await seed();
  await page.setViewportSize({ width: 390, height: 900 });
  await controls.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${root}/whole-turn-mcp-mobile.png` });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ))
  ) {
    throw new Error('Mobile overflow.');
  }
  await page.request.get(`${control}/pending-edit`);
  await prefill.click();
  await controls.getByRole('alert').waitFor();
  const refused = await (await page.request.get(control)).json();
  if (refused.clicks || refused.textSends || refused.draft) {
    throw new Error('A stale whole-turn draft reached the provider.');
  }
  await read();
  if (
    !(await prefill.isDisabled()) ||
    !(await draft.textContent()).includes('{{answer:1}}') ||
    errors.length
  ) {
    throw new Error('An unresolved earlier answer or page error was hidden.');
  }
  return {
    pendingMessages: 2,
    wholeDraftPrefilled: true,
    recoveredWithoutReplay: true,
    staleContextRefused: true,
    unknownAnswerHeld: true,
    mobileWidth: 390,
    ...refused,
    pageErrors: errors,
    liveProvider: false,
  };
};
