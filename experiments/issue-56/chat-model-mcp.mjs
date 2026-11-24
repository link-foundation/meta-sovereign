async (page) => {
  const root = '/tmp/gh-issue-solver-1794216540735/docs/screenshots';
  const capture = async (name, locator) => {
    await locator.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${root}/issue-56-chat-model-mcp-${name}.png`,
    });
  };
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  await page.reload();
  await page
    .locator('[data-automation="automation:model-chat"]')
    .first()
    .click();
  const editor = page.locator('form.automation-editor');
  const preview = editor.getByRole('button', { name: 'Preview', exact: true });
  const plan = page.locator('.automation-plan');
  await preview.click();
  await plan.getByText('answer-model-unavailable', { exact: false }).waitFor();
  const refused = await plan.innerText();
  if (
    !refused.includes('{{answer:2}}') ||
    !refused.includes('My English level is B2.')
  ) {
    throw new Error(
      'A refused call lost the known answer or concealed the unanswered part.'
    );
  }
  await capture('refused', plan);
  await preview.click();
  await plan
    .getByText('2. I build accessible browser interfaces.', { exact: false })
    .waitFor();
  const recovered = await plan.locator('blockquote').innerText();
  if (
    !recovered.includes('1. My English level is B2.') ||
    recovered.includes('{{answer:')
  ) {
    throw new Error(
      'Recovery failed to combine the unchanged approved and model answers.'
    );
  }
  await page.setViewportSize({ width: 1200, height: 800 });
  await capture('desktop', plan);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile', plan.locator('blockquote'));
  const phoneOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > globalThis.innerWidth
  );
  if (phoneOverflow) {
    throw new Error('The model review overflows the phone viewport.');
  }
  await editor.locator('[data-action="run-automation"]').click();
  await page.getByText('1 draft waits in its chat', { exact: false }).waitFor();
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/#chat=hh:model-chat`);
  const card = page.locator('.draft-card');
  await card.waitFor();
  const textarea = card.locator('textarea');
  const actual = await textarea.inputValue();
  if (
    !actual.includes('My English level is B2.') ||
    !actual.includes('I build accessible browser interfaces.')
  ) {
    throw new Error('The actual pending Chat draft differs from the preview.');
  }
  await capture('chat', textarea);
  await textarea.fill('MCP owner keeps the reviewed wording.');
  await page.locator('[data-action="draft-close"]').click();
  await card.waitFor({ state: 'detached' });
  await page.locator('[data-action="chat-automations"]').click();
  await page
    .locator(
      '[data-action="chat-automation-test"][data-automation="automation:model-chat"]'
    )
    .click();
  await card.waitFor();
  const ownerEditRetained =
    (await textarea.inputValue()) === 'MCP owner keeps the reviewed wording.';
  if (!ownerEditRetained) {
    throw new Error('Pending-draft recovery discarded the owner edit.');
  }
  return {
    refusedVisible: true,
    recovered,
    actual,
    ownerEditRetained,
    phoneOverflow,
  };
};
