async (page) => {
  const url = new URL(page.url());
  const form = url.searchParams.get('fixture');
  if (!form || new URL(form).hostname !== '127.0.0.1') {
    throw new Error('Use the isolated loopback fixture in ?fixture=.');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLanguage', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('[data-form-url]').fill(form);
  await page.locator('[data-form-slot]').fill('vacancy-pay-review');
  const sessionAction = async (name, selector) => {
    const response = page.waitForResponse((result) =>
      result.url().endsWith(`/api/forms/sessions/${name}`)
    );
    await page.locator(selector).click();
    return (await response).status();
  };
  const opened = await sessionAction(
    'open',
    '[data-action="open-form-review"]'
  );
  const read = await sessionAction('read', '[data-review-action="read"]');
  await page.locator('[data-form-profile]').selectOption('qa-profile:form-pay');
  const planned = await sessionAction('plan', '[data-action="plan-form"]');
  const firstCard = page.locator('[data-form-field]').first();
  const guidance = firstCard.locator('[data-salary-guidance="vacancy-pay"]');
  await guidance.waitFor();
  const text = await firstCard.textContent();
  if (
    !text.includes('Минимум — 476.19 ₽ в час на руки.') ||
    !text.includes('Комфортная ставка — 2 700 ₽ в час на руки.')
  ) {
    throw new Error('The viewport does not show the reviewed vacancy rate.');
  }
  await firstCard.locator('[data-form-select]').check();
  await firstCard.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => globalThis.scrollBy(0, -72));
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= globalThis.innerWidth
  );
  await page.screenshot({
    path: url.searchParams.get('capture') ?? 'ci-logs/forms-chat-pay-mcp.png',
  });
  const applied = await sessionAction(
    'apply',
    '[data-action="apply-form-plan"]'
  );
  await page.locator('[data-form-application="applied"]').waitFor();
  const receipts = await page.locator('[data-form-receipt="applied"]').count();
  const closed = await sessionAction('close', '[data-review-action="close"]');
  await page.locator('[data-form-review]').waitFor({ state: 'detached' });
  return {
    opened,
    read,
    planned,
    applied,
    closed,
    receipts,
    fits,
    errors,
    source: 'vacancy-pay',
  };
};
