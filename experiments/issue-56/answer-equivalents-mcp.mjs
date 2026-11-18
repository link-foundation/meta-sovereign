// Run against final-period-ui.mjs --wording, using the browser MCP page.
export default async (page) => {
  page.setDefaultTimeout(10000);
  await page.evaluate(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.reload();
  await page.setViewportSize({ width: 1180, height: 1000 });
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const question = 'When can you start work after an offer?';
  const choose = () =>
    panel.getByRole('button', { name: question, exact: true }).click();
  const refresh = async () => {
    await panel
      .getByRole('button', { name: 'Refresh answers', exact: true })
      .first()
      .click();
    await choose();
  };
  await choose();
  const editor = panel.locator('[data-answer-rule]');
  const field = editor.locator('[data-equivalent-answers]').first();
  const aliases =
    'One or two weeks after an offer.\nAfter an offer, in 1–2 weeks.';
  const check = (ok, message) => {
    if (!ok) {
      throw new Error(message);
    }
  };
  check(
    (await field.inputValue()) === aliases,
    'Initial saved equivalents missing'
  );
  const answer = editor.getByLabel('Answer', { exact: true }).first();
  const changed = 'One to two weeks after receiving an offer.';
  await answer.fill(changed);
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByText('Answer rule saved.', { exact: true }).waitFor();
  await refresh();
  check((await answer.inputValue()) === changed, 'Reload lost edited wording');
  const preview = panel.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: /^Preview answer$/u }),
  });
  await preview.locator(':scope > summary').click();
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill(question);
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  await preview
    .locator('[data-answer-preview] > pre')
    .filter({ hasText: changed })
    .waitFor();
  await preview
    .locator('[data-answer-preview]')
    .getByText('Observed answer turns: 5', { exact: true })
    .waitFor();
  // Encoded with the production encodeWire helper. Preserve the real wire type.
  await page.route('**/api/automations/answers/save', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'text/lino',
      body: '(\n  error "MCP wording refusal"\n  status "failed"\n)',
    })
  );
  const pending = `${aliases}\nAnother literal spelling.`;
  await field.fill(pending);
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'MCP wording refusal' })
    .waitFor();
  check(
    (await field.inputValue()) === pending,
    'Refused save lost pending draft'
  );
  check(
    (await panel.getByText('Answer rule saved.', { exact: true }).count()) ===
      0,
    'False save confirmation'
  );
  await page.unroute('**/api/automations/answers/save');
  await refresh();
  check(
    (await field.inputValue()) === aliases,
    'Refusal changed saved aliases'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await field.scrollIntoViewIfNeeded();
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'Compact overflow'
  );
  return {
    editedWordingReloaded: true,
    observations: 5,
    refusalPreservesDraft: true,
    noFalseConfirmation: true,
    recoveredSavedAliases: true,
    compactFits: true,
  };
};
