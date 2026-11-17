async (page) => {
  const base = new URL(page.url()).origin;
  const screenshot = new URL(page.url()).searchParams.get('screenshot');
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.goto(`${base}/#/automation`);
  await page.locator('[data-question-controls] > summary').click();
  const controls = page.locator(
    '[data-question-controls] [data-browser-answer-controls]'
  );
  await controls.locator(':scope > summary').click();
  await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
  await controls.locator('[data-browser-answer-inspect]').click();
  await controls.locator('[data-browser-answer-review]').waitFor();
  const watch = controls.locator('[data-browser-answer-watch]');
  await watch.locator('[data-browser-watch-start]').click();
  try {
    await watch.locator('[data-browser-watch-phase="review"]').waitFor();
    await watch.scrollIntoViewIfNeeded();
    if (screenshot) {
      await page.screenshot({ path: screenshot });
    }
    return { phase: 'review', liveProvider: false };
  } finally {
    await watch.locator('[data-browser-watch-stop]').click();
    await watch.locator('[data-browser-watch-state="stopped"]').waitFor();
  }
};
