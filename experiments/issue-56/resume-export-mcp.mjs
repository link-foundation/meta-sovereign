async (originalPage) => {
  const origin = new URL(originalPage.url()).origin;
  await originalPage.goto('about:blank');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.goto(`${origin}/#/cv`);
    const view = page.locator('[data-resume-exports]');
    const action = (name) =>
      view.locator(`[data-resume-export-action="${name}"]`);
    const complete = () =>
      page.waitForFunction(() => {
        const node = document.querySelector('[data-resume-export-state]');
        return (
          node?.dataset.resumeExportState === 'completed' &&
          node.dataset.resumeExportRequest ===
            globalThis.localStorage.getItem('meta-sovereign:resume-export:jobs')
        );
      });
    await page.waitForFunction(() => {
      const node = document.querySelector(
        '[data-resume-export-action="start"]'
      );
      return node && !node.disabled;
    });
    await action('start').focus();
    await page.keyboard.press('Enter');
    await complete();
    if ((await view.locator('[data-resume-export]').count()) !== 1) {
      throw new Error('Latest export did not appear.');
    }
    const file = await page.request.get(
      `${origin}/api/vacancies/resume-export-file?exportId=12345678-1234-4321-8123-123456789012&hash=english&name=resume.lino`,
      { headers: { origin } }
    );
    if (
      file.status() !== 200 ||
      !file.headers()['cache-control'].includes('no-store') ||
      !file.headers()['content-disposition'].includes('attachment')
    ) {
      throw new Error('Verified private attachment was not available.');
    }
    await page.locator('[data-vacancy-field="resume"]').fill('russian');
    await view.locator('[data-resume-export-scope]').selectOption('selected');
    await action('start').click();
    await complete();
    if ((await view.locator('[data-resume-export]').count()) !== 2) {
      throw new Error('Selected export did not preserve the latest result.');
    }
    await view.locator('[data-resume-export-scope]').selectOption('all');
    await action('start').click();
    await complete();
    const directory =
      '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-resume-exports/after';
    for (const [name, width] of [
      ['desktop', 1180],
      ['phone', 390],
    ]) {
      await page.setViewportSize({ width, height: 950 });
      await view.evaluate((node) => {
        node.style.scrollMarginTop = '72px';
        node.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      await page.waitForFunction(
        (node) => {
          const top = node.getBoundingClientRect().top;
          return top >= 56 && top < 200;
        },
        await view.elementHandle()
      );
      if (await page.locator('[data-tutorial-overlay]').count()) {
        throw new Error('An unrelated tutorial covers the export controls.');
      }
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > globalThis.innerWidth
        )
      ) {
        throw new Error('Export controls overflow the viewport.');
      }
      await page.screenshot({ path: `${directory}/exports-mcp-${name}.png` });
    }
    await page.reload();
    await complete();
    await view.locator('[data-resume-export]').first().waitFor();
    if (
      (await view.locator('[data-resume-export]').count()) !== 2 ||
      errors.length
    ) {
      throw new Error(JSON.stringify({ errors, cache: 'reload lost catalog' }));
    }
    return {
      cases: 4,
      exports: 2,
      attachmentStatus: file.status(),
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
