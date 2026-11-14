import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';

export const verifyNativeApplicationPopup = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await applicationNativeFixture(browser, { popup: true });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await panel.screenshot({
        path: join(screenshots, `application-popup-${name}.png`),
      });
    }
  };
  const owned = () => nativeApplicationForm(browser, applicationInput.url);
  try {
    await controls.select();
    await panel
      .locator('[data-application-letter]')
      .fill('Actual edited owner letter.');
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const first = owned();
    await first.locator('#experience').fill('Owner-only questionnaire answer.');
    await first.locator('[data-qa="add-cover-letter"]').click();
    await first
      .locator('[data-qa="vacancy-response-form-letter-input"]')
      .fill('Actual edited owner letter.');
    await controls.confirmed('read');
    await controls.confirmed('backup');
    await controls.close(first);
    await action('recover').click();
    await panel.locator('[data-application-state="interrupted"]').waitFor();
    await action('reopen').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    const recovered = owned();
    assert.notEqual(recovered, first);
    assert.equal(
      await recovered.evaluate(() => globalThis.applicationEntries),
      0
    );
    assert.equal(await recovered.locator('#native-form').count(), 0);
    if (before) {
      await shot('before');
      assert.equal(
        await action('reenter').count(),
        1,
        'acknowledged popup must offer separately confirmed re-entry'
      );
      return;
    }
    assert.equal(await action('enter').isDisabled(), true);
    assert.equal(await action('reenter').isDisabled(), true);
    await page.reload();
    await panel.locator('[data-application-reentry]').waitFor();
    assert.equal(await action('reenter').isDisabled(), true);
    assert.equal(
      await recovered.evaluate(() => globalThis.applicationEntries),
      0
    );
    await shot('ready');
    await controls.phone();
    await shot('phone');
    await controls.confirmed('reenter');
    await panel.locator('[data-application-state="review"]').waitFor();
    assert.equal(
      await recovered.evaluate(() => globalThis.applicationEntries),
      1
    );
    assert.equal(await recovered.locator('#experience').inputValue(), '');
    assert.equal(
      await recovered.evaluate(() => globalThis.applicationAttempts),
      0
    );
    await recovered.locator('[data-qa="add-cover-letter"]').click();
    await controls.confirmed('read');
    await controls.confirmed('restore');
    assert.equal(
      await recovered.locator('#experience').inputValue(),
      'Owner-only questionnaire answer.'
    );
    assert.equal(
      await recovered
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .inputValue(),
      'Actual edited owner letter.'
    );
    assert.equal(
      await recovered.locator('#header').inputValue(),
      'Owner header'
    );
    assert.equal(
      await recovered.evaluate(() => globalThis.applicationAttempts),
      0
    );
    assert.equal(await action('submit').isDisabled(), true);
    await shot('restored');
    await controls.confirmed('submit');
    await panel
      .locator('[data-application-delivery="provider-confirmed"]')
      .waitFor();
    assert.equal(
      await recovered.evaluate(() => globalThis.applicationAttempts),
      1
    );
    await controls.close(recovered);
    return {
      originalEntry: 1,
      recoveredConfirmedEntry: 1,
      automaticEntry: 0,
      restoredActualAnswers: true,
      submissions: 1,
      browsersClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
