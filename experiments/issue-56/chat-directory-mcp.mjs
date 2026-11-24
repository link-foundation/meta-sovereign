async (originalPage) => {
  const origin = new URL(originalPage.url()).searchParams.get('fixture');
  const context = await originalPage
    .context()
    .browser()
    .newContext({
      viewport: { width: 1200, height: 800 },
    });
  const page = await context.newPage();
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && consoleErrors.length < 32) {
      consoleErrors.push(message.text());
    }
  });
  const require = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  try {
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
    });
    await page.route('**/api/telegram/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const body = pathname.endsWith('/status')
        ? { connected: true, kind: 'user', account: { username: 'owner' } }
        : pathname.endsWith('/chat-info')
          ? { kind: 'user', title: null }
          : { written: 0, cached: true, complete: true, calls: [] };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    await page.goto(`${origin}/#chat=telegram:1`);
    await page.locator('[data-row="msg:telegram:1:1"]').waitFor();
    const list = page.locator('.chat-list');
    await list.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const last = list.locator('[data-chat="telegram:150"]');
    await last.waitFor();
    await last.focus();
    const observations = [];
    for (const [key, id] of [
      ['Home', '1'],
      ['End', '150'],
      ['ArrowUp', '149'],
      ['Home', '1'],
    ]) {
      await page.keyboard.press(key);
      await page.waitForFunction(
        (chat) =>
          document.activeElement?.getAttribute('data-chat') ===
          `telegram:${chat}`,
        id,
        { timeout: 10000 }
      );
      const mounted = await list.locator('[data-chat]').count();
      require(mounted < 60, 'Directory rendered offscreen archive rows');
      observations.push({ key, focused: id, mounted });
    }
    require(new URL(page.url()).hash ===
      '#chat=telegram:1', 'Focus changed selected chat');
    await page.screenshot({
      path: 'docs/screenshots/issue-56-directory-focus/mcp-after.png',
    });
    await list.locator('[data-chat="telegram:2"]').click();
    await page.locator('[data-row="msg:telegram:2:1"]').waitFor();
    require(errors.length === 0, errors.join('; '));
    require(consoleErrors.length === 0, consoleErrors.join('; '));
    return {
      observations,
      selectedChatRetained: true,
      clickSelection: true,
      pageErrors: errors,
      consoleErrors,
    };
  } finally {
    await context.close();
  }
};
