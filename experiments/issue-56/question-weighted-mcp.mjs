async (page) => {
  const origin = new URL(page.url()).origin;
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  const results = [];
  for (const [language, method, threshold, question, run] of [
    [
      'en',
      'Matching method',
      'Minimum similarity (%)',
      'Question or pattern',
      'Preview answer',
    ],
    [
      'ru',
      'Способ сопоставления',
      'Минимальное сходство (%)',
      'Вопрос или шаблон',
      'Предпросмотр ответа',
    ],
  ]) {
    await page.evaluate(
      (value) => globalThis.localStorage.setItem('metaSovereignLocale', value),
      language
    );
    await page.goto(`${origin}/#/automation`);
    await page.reload();
    const panel = page.locator('[data-question-controls]');
    await panel.locator(':scope > summary').click();
    const preview = panel
      .locator('details')
      .filter({ has: page.locator(':scope > summary', { hasText: run }) });
    await preview.locator(':scope > summary').click();
    await preview.getByLabel(method, { exact: true }).selectOption('weighted');
    await preview.getByLabel(threshold).fill('70');
    await preview
      .getByLabel(question, { exact: true })
      .fill('Describe your experiences in software engineering?');
    const pending = page.waitForResponse((item) =>
      item.url().endsWith('/api/automations/answers/plan')
    );
    await preview.getByRole('button', { name: run, exact: true }).click();
    if ((await pending).status() !== 200) {
      throw new Error('Preview request failed');
    }
    await preview
      .locator('[data-answer-preview]')
      .getByText('Five years building accessible applications.', {
        exact: true,
      })
      .waitFor();
    const text = await preview.locator('[data-answer-preview]').innerText();
    for (const [width, height] of [
      [1200, 800],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > globalThis.innerWidth
        )
      ) {
        throw new Error('Controls overflow');
      }
    }
    results.push({
      language,
      method: await preview.getByLabel(method, { exact: true }).inputValue(),
      text,
      phoneFits: true,
    });
    await page.setViewportSize({ width: 1200, height: 800 });
  }
  return { results, liveProvider: false };
};
