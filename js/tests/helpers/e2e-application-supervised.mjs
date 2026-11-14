import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import {
  nativeApplicationForm,
  nativeApplicationReviewRequest as request,
} from './application-native-request.mjs';
import { supervisedOptions } from '../../../experiments/issue-56/application-supervised-fixture.mjs';

export const verifyNativeApplicationSupervised = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await applicationNativeFixture(browser);
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action, confirm } = controls;
  const shot = controls.screenshot(screenshots, 'application-supervised');
  try {
    await controls.select();
    await panel
      .locator('[data-application-letter]')
      .fill(supervisedOptions.coverLetter);
    if (before) {
      assert.equal(
        await panel.locator('[data-application-option="supervised"]').count(),
        0
      );
      await shot('before');
      let receipt = await request(fixture, 'open', null, supervisedOptions);
      receipt = await request(fixture, 'advance', receipt, {
        action: 'enter',
        confirm: true,
      });
      receipt = await request(fixture, 'prefill', receipt, {
        part: 'answers',
        confirm: true,
      });
      assert.equal(receipt.delivery, 'none');
      return;
    }
    await panel.locator('[data-application-option="autoExact"]').check();
    await panel.locator('[data-application-option="supervised"]').check();
    assert.equal(
      await panel.locator('[data-application-option="autoExact"]').isChecked(),
      false
    );
    assert.equal(
      await panel.locator('[data-application-option="autoExact"]').isDisabled(),
      true
    );
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    await panel.locator('[data-application-state="review"]').waitFor();
    const owned = nativeApplicationForm(browser);
    assert.equal(await action('prefill').count(), 0);
    assert.equal(await action('answers').isDisabled(), true);
    await controls.confirmed('answers');
    await panel.locator('[data-form-answer="exact"]').first().waitFor();
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
    await panel.locator('[data-application-supervised]').waitFor();
    assert.equal(await action('letter').isDisabled(), true);
    await shot('answers');
    await controls.confirmed('letter');
    await panel.locator('[data-application-letter-state="verified"]').waitFor();
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    assert.equal(await action('submit').isDisabled(), true);
    await shot('letter');
    await controls.phone();
    await shot('phone');
    await confirm();
    await action('submit').click();
    await panel
      .locator('[data-application-delivery="provider-confirmed"]')
      .waitFor();
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 1);
    assert.equal(
      await owned.evaluate(() => globalThis.deliveredLetter),
      supervisedOptions.coverLetter
    );
    await controls.close(owned);
    return {
      separateAnswers: true,
      separateLetter: true,
      recoveredPreset: true,
      submissions: 1,
      browsersClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
