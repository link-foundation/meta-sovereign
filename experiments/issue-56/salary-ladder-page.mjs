/** Same finite UI assertions in the native harness and independent Playwright MCP. */
export const verifySalaryLadderPage = async ({
  page,
  base,
  before = false,
  screenshots,
}) => {
  const require = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };
  await page.goto(`${base}/#/cv`);
  const tutorialOff = page.locator('[data-action="tutorial-off"]');
  const dismissTutorial = async () => {
    if (await tutorialOff.isVisible()) {
      await tutorialOff.click();
      await tutorialOff.waitFor({ state: 'hidden' });
    }
  };
  const panel = page.locator('[data-vacancies]');
  const discovery = panel.locator('[data-vacancy-discovery]');
  await panel.locator('[data-vacancy-field="query"]').fill('Python');
  await panel.locator('[data-vacancy-field="resume"]').fill('fixture_cv');
  await discovery.locator('[data-discovery-field="maxPages"]').fill('3');
  const ladder = discovery.locator('[data-discovery-field="salaryLadder"]');
  if (before) {
    await dismissTutorial();
    await discovery.scrollIntoViewIfNeeded();
    if (screenshots) {
      await page.screenshot({
        path: `${screenshots}/issue-56-salary-ladder-before.png`,
      });
    }
    require((await ladder.count()) ===
      1, 'Matching-search salary tiers must be configurable');
    return;
  }
  require(await ladder.isChecked(), 'Salary tiers must default on');
  const salary = discovery.locator('[data-answer-salary]');
  await salary.locator(':scope > summary').click();
  await salary
    .getByLabel('Use configured salary targets', { exact: true })
    .check();
  await salary
    .getByLabel('Currency code, e.g. USD', { exact: true })
    .fill('RUB');
  await salary
    .getByLabel('Currency words, comma-separated', { exact: true })
    .fill('руб');
  await salary.getByLabel('Monthly net amount', { exact: true }).fill('450000');
  await salary.locator(':scope > summary').click();
  await discovery.locator('[data-discovery-action="start"]').click();
  const completed = discovery.locator('[data-discovery-phase="completed"]');
  await completed.waitFor({ timeout: 45000 });
  require(/Pages visited: 3/u.test(
    await completed.innerText()
  ), 'Tier scan lost native pagination');
  require(/Salary tier 2 · Minimum 400000 RUB/u.test(
    await completed.innerText()
  ), 'Tier did not descend after exhaustion');
  const excluded = discovery.locator(
    '[data-discovery-card="https://hh.ru/vacancy/802"]'
  );
  require(/Pay excluded/u.test(
    await excluded.innerText()
  ), 'Hard-cap exclusion missing');
  require(/Pay eligible/u.test(
    await discovery
      .locator('[data-discovery-card="https://hh.ru/vacancy/801"]')
      .innerText()
  ), 'Deferred vacancy was not released');
  await completed.scrollIntoViewIfNeeded();
  await dismissTutorial();
  if (screenshots) {
    await page.screenshot({
      path: `${screenshots}/issue-56-salary-ladder-after.png`,
    });
  }
  await page.reload();
  await completed.waitFor();
  const batch = panel.locator('[data-application-batch]');
  await batch
    .locator('[data-application-batch-action="use-discovery"]')
    .click();
  require((await batch
    .locator('[data-application-batch-field="urls"]')
    .inputValue()) ===
    'https://hh.ru/vacancy/801\nhttps://hh.ru/vacancy/803', 'Batch included an excluded or responded vacancy');
  require(await batch
    .locator('[data-application-batch-action="start"]')
    .isDisabled(), 'Copying discovery armed a batch');
  for (const locale of ['ru', 'hi', 'zh', 'en']) {
    await page.evaluate(
      (locale) =>
        globalThis.localStorage.setItem('metaSovereignLocale', locale),
      locale
    );
    await page.reload();
    await completed.waitFor();
    require(!/discovery\.(?:salary|pay)/u.test(
      await discovery.innerText()
    ), 'Missing salary localization');
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await completed.scrollIntoViewIfNeeded();
  require(await page.evaluate(
    () => document.documentElement.scrollWidth <= globalThis.innerWidth
  ), 'Phone overflow');
  if (screenshots) {
    await page.screenshot({
      path: `${screenshots}/issue-56-salary-ladder-phone.png`,
    });
  }
  return {
    pages: 3,
    tier: 1,
    vacancies: 4,
    excluded: 1,
    released: 1,
    locales: 4,
    batchStarted: false,
  };
};
