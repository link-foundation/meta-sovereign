async (originalPage, fixture) =>
  fixture(originalPage, async ({ page, require, owner, errors }) => {
    const resumes = page.locator('[data-vacancy-resumes]');
    const action = (name) => page.locator(`[data-vacancy-action="${name}"]`);
    const selected = page.locator('[data-vacancy-field="resume"]');
    await action('resumes').click();
    await resumes.locator('[data-resume-language="ru"]').waitFor();
    require((await action('resume-suggested').innerText()).includes(
      'Senior Software Engineer'
    ), 'A title hint overrode checked Russian export evidence');
    await action('resume-suggested').click();
    require((await selected.inputValue()) ===
      'english', 'Suggested search hash was not selected');
    await resumes.locator('[data-vacancy-resume="russian-old"] button').click();
    const initial = await owner('stats');
    await page.setViewportSize({ width: 390, height: 950 });
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (value) =>
          globalThis.localStorage.setItem('metaSovereignLocale', value),
        locale
      );
      await page.reload();
      await resumes.locator('[data-resume-language="ru"]').waitFor();
      require((await selected.inputValue()) ===
        'russian-old', 'Reload replaced the owner search choice');
      require(!(await resumes.innerText()).includes(
        'vacancy.'
      ), 'Résumé evidence is untranslated');
      require(!(await page.evaluate(
        () => document.documentElement.scrollWidth > globalThis.innerWidth
      )), 'Phone view overflow');
    }
    const stats = await owner('stats');
    require(stats.opens === initial.opens &&
      stats.closed &&
      stats.providerClicks ===
        0, 'Cached reads opened or mutated the provider');
    require(errors.length === 0, 'Browser page errors');
    return {
      verifiedLanguage: 'ru',
      suggested: 'english',
      manual: 'russian-old',
      locales: 4,
      ...stats,
      pageErrors: errors,
    };
  });
