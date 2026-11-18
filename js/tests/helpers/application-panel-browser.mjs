import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

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
    batch() {
      const batch = panel.locator('[data-application-batch]');
      return {
        batch,
        field: (name) =>
          batch.locator(`[data-application-batch-field="${name}"]`),
        button: (name) =>
          batch.locator(`[data-application-batch-action="${name}"]`),
        phase: (name) =>
          batch
            .locator(`[data-application-batch-phase="${name}"]`)
            .waitFor({ timeout: 60000 }),
      };
    },
    screenshot(directory, prefix) {
      return async (name, target = panel) => {
        if (directory) {
          await mkdir(directory, { recursive: true });
          await target.screenshot({
            path: join(directory, `${prefix}-${name}.png`),
          });
        }
      };
    },
    async locales(selector, verify = async () => {}, target = panel) {
      for (const locale of ['ru', 'hi', 'zh', 'en']) {
        await page.evaluate(
          (value) =>
            globalThis.localStorage.setItem('metaSovereignLocale', value),
          locale
        );
        await page.reload();
        await target.locator(selector).waitFor();
        assert.equal(
          /\bapplication\.[a-z]/iu.test(await target.innerText()),
          false
        );
        await verify(locale);
      }
    },
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
      // A batch can close this delivered browser and move to its next review.
      // Completion needs an accepted, idle receipt, not an active native page.
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-application-option="confirm"]')
            .checked &&
          !document.querySelector('[data-application-action="recover"]')
            .disabled &&
          !document.querySelector('[data-application-unknown]')
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
