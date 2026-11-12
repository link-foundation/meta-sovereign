async (page) => {
  const location = new URL(page.url());
  const control = location.searchParams
    .get('fixtureControl')
    ?.replace(/\/$/u, '');
  const screenshots = location.searchParams.get('screenshots');
  if (!control) {
    throw new Error('Supply the isolated fixtureControl URL.');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.goto(`${location.origin}/#/cv`);
  const panel = page.locator('[data-cv-translation]');
  const text = panel.locator('[data-cv-translation-text]');
  const action = (name) =>
    panel.locator(`[data-cv-translation-action="${name}"]`);
  const result = panel.locator('[data-cv-translation-result]');
  const stats = async () => (await page.request.get(control)).json();
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const compare = async () => {
    const previous = await result.evaluateAll(
      (nodes) => nodes[0]?.getAttribute('data-cv-translation-request') ?? null
    );
    await action('generate').click();
    await page.waitForFunction((previous) => {
      const node = document.querySelector(
        '[data-cv-translation-result="completed"]'
      );
      return (
        node && node.getAttribute('data-cv-translation-request') !== previous
      );
    }, previous);
  };
  await panel.waitFor();
  check((await stats()).modelCalls === 0, 'No model calls on render');
  await text.fill('Разрабатывал приложения на JavaScript.');
  await compare();
  check(
    (await panel.locator('[data-cv-translation-variant]').count()) === 3,
    'Three variants required'
  );
  check(
    (await panel.textContent()).includes('placeholder'),
    'Rejected output must remain visible'
  );
  check((await stats()).modelCalls === 3, 'Exactly three selected translators');
  await result.scrollIntoViewIfNeeded();
  if (screenshots) {
    await page.screenshot({
      path: `${screenshots}/cv-translation-mcp-desktop.png`,
    });
  }
  await compare();
  check(
    (await stats()).modelCalls === 4,
    'Only the invalid variant should be asked again'
  );
  check(
    (await panel
      .getByText('Cached for this model/version', { exact: true })
      .count()) === 2,
    'Two versioned cache entries'
  );
  const verifyFailure = async () => {
    await page.request.post(`${control}/fail`);
    await text.fill('Руководил разработкой программного обеспечения.');
    await compare();
    check(
      (await panel.textContent()).includes('Preferred variant: Luna'),
      'Failure must preserve an alternative'
    );
    await page.request.post(`${control}/ready`);
  };
  await verifyFailure();
  let posts = 0;
  await page.route('**/api/vacancies/cv-translate', async (route) => {
    posts++;
    await route.fetch();
    await route.abort('failed');
  });
  await text.fill('Проверял приложения и качество.');
  await action('generate').click();
  await page.locator('[data-vacancy-error]').waitFor();
  const count = (await stats()).modelCalls;
  const pending = await page.evaluate(() =>
    globalThis.localStorage.getItem('meta-sovereign:cv-translation:jobs')
  );
  await page.unroute('**/api/vacancies/cv-translate');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await panel.locator('[data-cv-translation-result="completed"]').waitFor();
  check(
    (await result.getAttribute('data-cv-translation-request')) === pending,
    'GET must recover the exact request'
  );
  check(
    posts === 1 && (await stats()).modelCalls === count,
    'Reload must not replay translation'
  );
  const geometry = await panel.evaluate((node) => ({
    width: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  check(geometry.scroll <= geometry.width + 1, 'Phone must not overflow');
  await result.scrollIntoViewIfNeeded();
  if (screenshots) {
    await page.screenshot({
      path: `${screenshots}/cv-translation-mcp-phone.png`,
    });
  }
  const verifyStop = async () => {
    await page.request.post(`${control}/wait`);
    await text.fill('Создавал системы для пользователей.');
    await action('generate').click();
    const deadline = Date.now() + 5000;
    while ((await stats()).modelCalls === count && Date.now() < deadline) {
      await page.waitForTimeout(20);
    }
    check(
      (await stats()).modelCalls === count + 1,
      'The owned translator must be admitted before Stop'
    );
    await action('stop').click();
    await panel.locator('[data-cv-translation-result="stopped"]').waitFor();
    check(
      (await stats()).drained === 1,
      'Stop must drain the admitted translator'
    );
    await page.reload();
    await panel.locator('[data-cv-translation-result="stopped"]').waitFor();
    check(
      (await stats()).modelCalls === count + 1,
      'Stopped work must not restart'
    );
  };
  await verifyStop();
  check(errors.length === 0, 'No unhandled browser errors');
  return { cases: 5, ...(await stats()), posts, geometry, errors };
};
