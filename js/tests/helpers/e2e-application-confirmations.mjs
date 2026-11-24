import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

export const verifyNativeApplicationConfirmations = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await applicationNativeFixture(browser);
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const shot = controls.screenshot(screenshots, 'application-confirmations');
  const pending = (step) =>
    panel.locator(`[data-application-continuation="${step}"]`).waitFor();
  try {
    await controls.select();
    if (before) {
      await shot('before');
      assert.equal(
        await panel
          .locator('[data-application-confirmation="answers"]')
          .count(),
        1,
        'independent confirmation control is absent'
      );
      return;
    }
    await panel
      .locator('[data-application-letter]')
      .fill('A separately reviewed continuation letter.');
    await panel.locator('[data-application-confirmation="answers"]').check();
    await panel
      .locator('[data-application-confirmation="cover-letter"]')
      .check();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await action('continue').click();
    await pending('answers');
    const owned = nativeApplicationForm(browser);
    assert.equal(await owned.locator('#experience').inputValue(), '');
    assert.equal(await action('confirm-step').isDisabled(), true);
    await shot('answers');
    await controls.confirmed('confirm-step');
    await pending('cover-letter');
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Five years building Python services.'
    );
    assert.equal(
      await owned
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .count(),
      0
    );
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await page.reload();
    await pending('cover-letter');
    assert.equal(await action('confirm-step').isDisabled(), true);
    await controls.confirmed('confirm-step');
    await pending('send');
    assert.equal(
      await owned
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .inputValue(),
      'A separately reviewed continuation letter.'
    );
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await shot('send');
    await controls.locales('[data-application-continuation="send"]');
    await controls.phone();
    await shot('phone');
    await controls.confirmed('confirm-step');
    await panel
      .locator('[data-application-delivery="provider-confirmed"]')
      .waitFor();
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 1);
    await shot('complete');
    await controls.close(owned);
    return {
      confirmations: 3,
      entryClicks: 0,
      submissions: 1,
      reloadReplayed: false,
      locales: 4,
      phone: true,
      resourcesClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
