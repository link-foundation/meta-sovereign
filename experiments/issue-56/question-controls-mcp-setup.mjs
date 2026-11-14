/** Prepare the independent MCP production controls and their read-only refresh. */
export const prepareQuestionBrowserMcp = async (page, { screenshots } = {}) => {
  if (screenshots) {
    page.setDefaultTimeout(10000);
    await page.addInitScript(() =>
      globalThis.localStorage.setItem(
        'metaSovereignOperatorScope',
        JSON.stringify({ private: true, bot: true })
      )
    );
  }
  const url = new URL(page.url());
  const base = url.origin;
  const control = url.searchParams.get('fixtureControl');
  if (!control || new URL(control).hostname !== '127.0.0.1') {
    throw new Error('Open the private fixture with its loopback control URL.');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.goto(`${base}/#/automation`);
  await page.locator('[data-question-controls] > summary').click();
  const controls = page.locator(
    '[data-question-controls] [data-browser-answer-controls]'
  );
  await controls.locator(':scope > summary').click();
  await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
  const read = async () => {
    const previous = await controls
      .locator('[data-browser-answer-review]')
      .getAttribute('data-browser-answer-review')
      .catch(() => null);
    await controls.locator('[data-browser-answer-inspect]').click();
    await controls
      .locator(
        previous
          ? `[data-browser-answer-review]:not([data-browser-answer-review="${previous}"])`
          : '[data-browser-answer-review]'
      )
      .waitFor();
  };
  const stats = async () => (await page.request.get(control)).json();
  const check = (ok, message) => {
    if (!ok) {
      throw new Error(message);
    }
  };
  const shot = async (name, node) => {
    await node.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/mcp-${name}.png` });
  };
  const unreadSurface = async (surface, hash, width) => {
    await page.request.get(`${control}/seed`);
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`${base}/?unread-${surface}${hash}`);
    await page.locator('[data-action="chat-automations"]').click();
    const menu = page.locator('.chat-menu-list [data-browser-answer-controls]');
    await menu.locator(':scope > summary').click();
    return menu.locator('[data-browser-unread-controls]');
  };
  return { control, controls, errors, read, stats, check, shot, unreadSurface };
};

export const waitForQuestionPrefill = (controls) =>
  controls
    .getByRole('button', {
      name: 'Draft prefilled; review it in the provider chat',
      exact: true,
    })
    .waitFor();
