async (page) => {
  const modelUrl = '**/api/automations/answers/model';
  const panel = page.locator('[data-answer-model-settings]');
  await panel.locator('summary').click();
  await panel.locator('fieldset:not([disabled])').waitFor();
  let hold;
  const blocked = new Promise((resolve) => {
    hold = resolve;
  });
  await page.route(modelUrl, (route) => hold(route));
  await page.locator('[data-reload-answer-model]').click();
  const heldRequest = await blocked;
  const name = page.locator('[data-answer-model-name]');
  const save = page.locator('[data-save-answer-model]');
  const disabled = [await name.isDisabled(), await save.isDisabled()];
  await heldRequest.continue();
  await page.unroute(modelUrl);
  await panel.locator('fieldset:not([disabled])').waitFor();
  if (!disabled.every(Boolean)) {
    throw new Error('The held reload allowed a model edit or save.');
  }
  await name.fill('mcp-reviewed-model');
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/automations/answers/model') &&
      response.request().method() === 'POST'
  );
  await save.click();
  const status = (await saved).status();
  if (status !== 200) {
    throw new Error(`Model save returned ${status}.`);
  }
  await page.reload();
  await panel.locator('summary').click();
  await panel.locator('fieldset:not([disabled])').waitFor();
  const actual = await name.inputValue();
  if (actual !== 'mcp-reviewed-model') {
    throw new Error(`Reload replaced the saved model: ${actual}.`);
  }
  return { disabledWhileReloading: disabled, status, actual };
};
