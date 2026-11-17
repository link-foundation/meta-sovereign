/** Exercise actual shared batch controls; both native and MCP use this flow. */
export const exerciseSalaryBatchUi = async (
  page,
  applicationPanelBrowser,
  configureApplicationAnswerContext,
  { before = false, screenshot } = {}
) => {
  const controls = applicationPanelBrowser({
    page,
    base: new URL(page.url()).origin,
  });
  const { panel, action } = controls;
  const { batch, field, button, phase } = controls.batch();
  const follow = async (release = false) => {
    if (release) {
      await action('recover').click();
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-application-action="release"]')
            .disabled
      );
      await action('release').click();
    }
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-application-batch-action="follow"]')
          .disabled
    );
    await button('follow').click();
    await panel.locator('[data-application-continuation="send"]').waitFor();
  };
  const current = (url) =>
    page.waitForFunction(
      (value) =>
        document.querySelector('[data-application-batch-current]')
          ?.textContent === value,
      url,
      { timeout: 60000 }
    );
  await controls.select();
  await configureApplicationAnswerContext(panel);
  await panel.locator('[data-application-option="pacing"]').check();
  await panel.locator('[data-application-pacing-interval]').fill('2');
  await field('urls').fill(
    'https://hh.ru/vacancy/123\nhttps://hh.ru/vacancy/456'
  );
  await field('confirmBatch').check();
  await button('start').click();
  await current('https://hh.ru/vacancy/456');
  await follow();
  const salary = batch.locator('[data-application-batch-salary]');
  if (!before && !(await salary.innerText()).includes('450000')) {
    throw new Error('The initial salary tier was not displayed.');
  }
  await controls.confirmed('confirm-step');
  if (before) {
    await phase('completed');
    await screenshot?.('before', batch);
    return { before: true, deliveries: 1, salaryRevisited: false };
  }
  await current('https://hh.ru/vacancy/123');
  await follow(true);
  if (!(await salary.innerText()).includes('400000')) {
    throw new Error(
      'The exhausted batch did not lower its floor by 50000 RUB.'
    );
  }
  if (!(await action('confirm-step').isDisabled())) {
    throw new Error('The salary revisit lost its separate send confirmation.');
  }
  await screenshot?.('after', batch);
  await controls.locales('[data-application-batch-salary]', async () => {
    if (!(await salary.innerText()).includes('400000')) {
      throw new Error('Reload changed the live salary floor.');
    }
  });
  await controls.phone();
  await screenshot?.('phone', batch);
  await controls.confirmed('confirm-step');
  await phase('completed');
  await page.reload();
  await phase('completed');
  return {
    before: false,
    deliveries: 2,
    salaryRevisited: true,
    initialFloorRub: 450000,
    nextFloorRub: 400000,
    locales: 4,
    phoneOverflow: false,
    restartReplayed: false,
  };
};
