import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationResumeNativeFixture } from '../../../experiments/issue-56/application-resume-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { verifyResumeAdmission } from './application-resume-admission.mjs';
import { verifyApplicationContextBrowser } from './application-context-browser.mjs';
import { openFullFormReview } from './application-fullform-browser.mjs';

export const verifyNativeApplicationResume = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await applicationResumeNativeFixture(browser);
  const controls = applicationPanelBrowser(fixture);
  const { panel, action, page } = controls;
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await panel.screenshot({
        path: join(screenshots, `application-resume-${name}.png`),
      });
    }
  };
  try {
    await controls.select();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    const fullForm = !before && process.env.APPLICATION_CONTEXT_BEFORE !== '1';
    const owned = await openFullFormReview(controls, browser, {
      fullForm,
      screenshots,
    });
    await owned.locator('#experience').fill('Owner answer retained.');
    await owned.locator('[data-qa="add-cover-letter"]').click();
    await owned
      .locator('[data-qa="vacancy-response-form-letter-input"]')
      .fill('Owner letter retained.');
    await action('read').click();
    await panel.locator('[data-application-state="review"]').waitFor();
    if (before) {
      await shot('before');
    }
    assert.equal(
      await action('resume-menu').count(),
      1,
      'Native resume choice is missing.'
    );
    assert.equal(await action('resume-menu').isDisabled(), true);
    await controls.confirmed('resume-menu');
    const choice = panel.locator('[data-application-resume="english"]');
    await choice.waitFor();
    assert.equal(await choice.isDisabled(), true);
    await controls.confirm();
    await choice.click();
    await panel.locator('[data-application-resume-proof="ru"]').waitFor();
    assert.equal(
      await owned.locator('input[name="native-resume"]:checked').inputValue(),
      'english'
    );
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Owner answer retained.'
    );
    assert.equal(
      await owned
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .inputValue(),
      'Owner letter retained.'
    );
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    assert.equal(await action('submit').isDisabled(), true);
    await shot('after');
    const contextualChoice = await verifyApplicationContextBrowser(
      controls,
      owned,
      screenshots
    );
    if (fullForm && screenshots) {
      await panel.screenshot({
        path: join(screenshots, 'application-fullform-after.png'),
      });
    }
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (value) =>
          globalThis.localStorage.setItem('metaSovereignLocale', value),
        locale
      );
      await page.reload();
      await panel.locator('[data-application-resume-title]').waitFor();
      assert.equal(
        await panel.locator('[data-application-resume-title]').innerText(),
        'Senior Software Engineer'
      );
      assert.equal(await action('resume-menu').isDisabled(), true);
    }
    await controls.phone();
    await shot('phone');
    if (fullForm && screenshots) {
      await panel.screenshot({
        path: join(screenshots, 'application-fullform-phone.png'),
      });
    }
    if (screenshots) {
      await panel
        .locator('[data-application-resume-title]')
        .locator('..')
        .screenshot({
          path: join(screenshots, 'application-context-phone.png'),
        });
    }
    assert.deepEqual(
      await owned.evaluate(() => ({
        menus: globalThis.resumeMenus,
        choices: globalThis.resumeChoices,
        sends: globalThis.applicationAttempts,
      })),
      { menus: 3, choices: 3, sends: 0 }
    );
    const refusedUnsafeTargets = await verifyResumeAdmission(owned);
    await controls.close(owned);
    return {
      checkedHash: 'english',
      exportLanguage: 'ru',
      ownerValuesPreserved: true,
      sends: 0,
      locales: 4,
      browsersClosed: true,
      errors: fixture.errors,
      refusedUnsafeTargets,
      contextualChoice,
      fullFormNavigation: fullForm,
      entryClicks: fullForm ? 0 : 1,
    };
  } finally {
    await fixture.close();
  }
};
