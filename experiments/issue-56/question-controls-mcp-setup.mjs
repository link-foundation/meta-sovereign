/** Prepare the independent MCP production controls and their read-only refresh. */
export const prepareQuestionBrowserMcp = async (page) => {
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
  return { control, controls, errors, read };
};

export const waitForQuestionPrefill = (controls) =>
  controls
    .getByRole('button', {
      name: 'Draft prefilled; review it in the provider chat',
      exact: true,
    })
    .waitFor();
