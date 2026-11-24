async (page) => {
  const base = new URL(page.url()).origin;
  const dir =
    '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-layout-observer';
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const result = [];
  for (const [layout, width, height] of [
    ['desktop', 1000, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const mode of ['transient', 'persistent', 'reading']) {
      await page.goto(`${base}/?mode=${mode}`);
      await page.waitForFunction(() => globalThis.layoutEntries?.length);
      const entry = await page.evaluate(() => globalThis.layoutEntries[0]);
      if (
        entry.level !== (mode === 'persistent' ? 'warn' : 'debug') ||
        entry.bottomGap !== (mode === 'transient' ? 8 : -30)
      ) {
        throw new Error(`${layout}/${mode}: ${JSON.stringify(entry)}`);
      }
      await page.screenshot({ path: `${dir}/mcp-${mode}-${layout}.png` });
      await page.evaluate(() => globalThis.unmountFixture());
      result.push({ layout, mode, level: entry.level, gap: entry.bottomGap });
    }
  }
  if (errors.length) {
    throw new Error(JSON.stringify(errors));
  }
  return { result, pageErrors: errors };
};
