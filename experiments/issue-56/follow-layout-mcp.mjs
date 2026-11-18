async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.reload();
  const card = page.locator('[data-follow-backlinks]');
  const summary = card.locator(':scope > summary');
  await summary.waitFor();
  const open = async () => {
    if (!(await card.evaluate((node) => node.open))) {
      await summary.focus();
      if (
        !(await summary.evaluate((node) => node === document.activeElement))
      ) {
        throw new Error('Native summary focus missing');
      }
      await summary.press('Enter');
    }
    if (!(await card.evaluate((node) => node.open))) {
      throw new Error('Native disclosure stayed closed');
    }
  };
  await open();
  const chats = card.locator('[data-follow-backlink-field="chats"]');
  await chats.fill('-7');
  await open();
  if ((await chats.inputValue()) !== '-7' || errors.length) {
    throw new Error('Owner draft or page error regression');
  }
  await page.screenshot({
    path: 'docs/screenshots/issue-56-ci-follow-layout/mcp-after.png',
  });
  return {
    nativeKeyboardOpened: true,
    repeatedOpeningPreservedDraft: true,
    errors,
    liveProvider: false,
  };
};
