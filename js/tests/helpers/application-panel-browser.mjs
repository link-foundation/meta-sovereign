import assert from 'node:assert/strict';

/** Operate the production panel in an isolated vacancy fixture. */
export const applicationPanelBrowser = (fixture) => {
  const { page } = fixture;
  page.setDefaultTimeout(10000);
  const panel = page.locator('[data-application-panel]');
  const action = (name) => panel.locator(`[data-application-action="${name}"]`);
  const confirm = () =>
    panel.locator('[data-application-option="confirm"]').check();
  return {
    page,
    panel,
    action,
    confirm,
    async phone() {
      await page.setViewportSize({ width: 390, height: 1440 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        true
      );
    },
    async close(owned) {
      await action('close').click();
      await panel.locator('[data-application-state="closed"]').waitFor();
      assert(owned.isClosed());
      assert(fixture.records.every((record) => record.closed));
      assert.deepEqual(fixture.errors, []);
    },
    async confirmed(name) {
      await confirm();
      await action(name).click();
      // Completion includes the new receipt and its renewed owner confirmation.
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-application-option="confirm"]')
            .checked &&
          !document.querySelector('[data-application-action="read"]').disabled
      );
    },
    async select() {
      await page.goto(`${fixture.base}/#/cv`);
      const vacancies = page.locator('[data-vacancies]');
      await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
      await vacancies.locator('[data-vacancy-action="search"]').click();
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .click();
      await panel.locator('[data-application-missing]').waitFor();
      const languagePolicy = panel.locator(
        '[data-application-option="autoSelectResumeLanguage"]'
      );
      if (await languagePolicy.count()) {
        await languagePolicy.uncheck();
      }
      return vacancies;
    },
  };
};
