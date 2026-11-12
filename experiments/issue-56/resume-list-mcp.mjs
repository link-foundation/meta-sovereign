async (originalPage) => {
  const origin = new URL(originalPage.url()).origin;
  // A fresh context keeps prior MCP tasks' init scripts out of this fixture.
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
    const panel = page.locator('[data-vacancies]');
    const resumes = panel.locator('[data-vacancy-resumes]');
    const action = (name) => panel.locator(`[data-vacancy-action="${name}"]`);
    const field = (key) => panel.locator(`[data-vacancy-field="${key}"]`);
    await action('resumes').click();
    await resumes.locator('[data-vacancy-resume]').first().waitFor();
    if (
      (await resumes.locator('[data-vacancy-resume]').count()) !== 3 ||
      !(await action('resume-suggested').innerText()).includes(
        'Ведущий разработчик'
      )
    ) {
      throw new Error(
        'The native list or Russian-title recommendation is missing.'
      );
    }
    const select = resumes.locator(
      '[data-vacancy-resume="russian-old"] button'
    );
    await select.focus();
    await page.keyboard.press('Enter');
    if (
      (await field('resume').inputValue()) !== 'russian-old' ||
      (await select.getAttribute('aria-pressed')) !== 'true'
    ) {
      throw new Error('The explicit keyboard selection was not reflected.');
    }
    await field('resumeLanguage').selectOption('any');
    await action('resume-suggested').click();
    if ((await field('resume').inputValue()) !== 'english') {
      throw new Error(
        'Latest observed update did not select the English-titled resume.'
      );
    }
    const directory =
      '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-job-resumes/after';
    for (const [name, width] of [
      ['desktop', 1180],
      ['phone', 390],
    ]) {
      await page.setViewportSize({ width, height: 950 });
      await resumes.scrollIntoViewIfNeeded();
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > globalThis.innerWidth
        )
      ) {
        throw new Error('Resume controls overflow the viewport.');
      }
      if (await page.locator('[data-tutorial-overlay]').count()) {
        throw new Error('The isolated UI capture is covered by a tutorial.');
      }
      await page.screenshot({ path: `${directory}/resumes-mcp-${name}.png` });
    }
    await page.reload();
    await resumes.locator('[data-vacancy-resume]').first().waitFor();
    if (
      (await field('resume').inputValue()) !== 'english' ||
      (await field('resumeLanguage').inputValue()) !== 'any'
    ) {
      throw new Error(
        'Reload did not restore the cached slot and chosen search settings.'
      );
    }
    if (errors.length) {
      throw new Error(JSON.stringify(errors));
    }
    return {
      cases: 3,
      selectedResume: 'english',
      nativeRows: 3,
      pageErrors: errors,
    };
  } finally {
    await context.close();
  }
};
