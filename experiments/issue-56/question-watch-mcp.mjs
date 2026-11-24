async (page) => {
  const base = new URL(page.url()).origin;
  const control = new URL(page.url()).searchParams.get('fixtureControl');
  if (!control || new URL(control).hostname !== '127.0.0.1') {
    throw new Error('Open the private fixture with its loopback control URL.');
  }
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-question-watch/after';
  const stats = async () => (await page.request.get(control)).json();
  let cases = 0;
  for (const [surface, hash, width] of [
    ['chat', '#chat=hh:7', 1180],
    ['operator', '#/operator?chat=hh%3A7', 390],
  ]) {
    await page.request.get(`${control}/reset?draft=My%20own%20answer`);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 950 });
    await page.goto(`${base}/?watch-mcp=${surface}${hash}`);
    await page.locator('[data-action="chat-automations"]').click();
    const controls = page.locator(
      '.chat-menu-list [data-browser-answer-controls]'
    );
    await controls.locator(':scope > summary').click();
    await controls.locator('[data-browser-answer-inspect]').click();
    await controls.locator('[data-browser-answer-review]').waitFor();
    const watch = controls.locator('[data-browser-answer-watch]');
    await watch.locator('[data-browser-watch-start]').click();
    await watch
      .locator(
        '[data-browser-watch-state="active"][data-browser-watch-phase="owner-draft"]'
      )
      .waitFor();
    await watch.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${root}/mcp-watch-${surface}.png` });
    const active = await stats();
    if (
      active.clicks !== 0 ||
      active.textSends !== 0 ||
      active.draft !== 'My own answer'
    ) {
      throw new Error('An owner draft was changed or sent.');
    }
    await watch.locator('[data-browser-watch-stop]').click();
    await watch.locator('[data-browser-watch-state="stopped"]').waitFor();
    await watch.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${root}/mcp-watch-stopped-${surface}.png` });
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ))
    ) {
      throw new Error('Mobile overflow.');
    }
    cases++;
  }
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }
  return { cases, pageErrors: errors, ...(await stats()), liveProvider: false };
};
