// Run with Playwright MCP after navigating to the isolated telegram-backlinks-ui server.
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
  const before = await card.evaluate((node) => node.open);
  const original = await card.elementHandle();
  await summary.click();
  const field = (key) => card.locator(`[data-follow-backlink-field="${key}"]`);
  await field('source').selectOption('telegram');
  await field('chats').fill('-7');
  await field('backlink').fill('https://vk.me/join/valid_invite');
  const state = {
    before,
    after: await card.evaluate((node) => node.open),
    sameRoot: await original.evaluate(
      (node) => node === document.querySelector('[data-follow-backlinks]')
    ),
    fieldVisible: await field('source').isVisible(),
    errors,
  };
  await original.dispose();
  if (
    before ||
    !state.after ||
    !state.sameRoot ||
    !state.fieldVisible ||
    errors.length
  ) {
    throw new Error(JSON.stringify(state));
  }
  return state;
};
