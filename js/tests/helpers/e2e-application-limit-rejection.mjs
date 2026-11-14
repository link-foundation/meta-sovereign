import assert from 'node:assert/strict';
import { rejectNativeApplicationAtLimit } from '../../../experiments/issue-56/application-limit-rejection-dom.mjs';
import { applicationLimitBrowser } from './application-limit-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

/** A real guarded Send is refused, then separately consented recovery restores. */
export const verifyNativeApplicationLimitRejection = async (browser) => {
  const { fixture, clock, controls, panel, action, shot } =
    await applicationLimitBrowser(
      browser,
      process.env.APPLICATION_SCREENSHOTS ?? process.env.E2E_ARTIFACT_DIR,
      'application-limit-rejection'
    );
  try {
    await controls.select();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const native = nativeApplicationForm(browser);
    await native
      .locator('#experience')
      .fill('Actual owner answer before refused Send.');
    await native.locator('[data-qa="add-cover-letter"]').click();
    await native
      .locator('[data-qa="vacancy-response-form-letter-input"]')
      .fill('Actual owner letter before refused Send.');
    await native.evaluate(rejectNativeApplicationAtLimit);
    await controls.confirmed('read');
    await controls.confirmed('submit');
    await panel.locator('[data-application-state="daily-limit"]').waitFor();
    assert.equal(
      await native.evaluate(() => globalThis.applicationAttempts),
      1
    );
    await controls.confirm();
    if (process.env.APPLICATION_LIMIT_BEFORE === '1') {
      await shot('before');
    }
    assert.equal(
      await action('wait-limit-restore').isEnabled(),
      true,
      'Issued native rejection cannot be restored after the daily pause.'
    );
    await panel
      .locator('[data-application-daily-rejection="recorded"]')
      .waitFor();
    await shot('recorded');
    await action('wait-limit-restore').click();
    await panel.locator('[data-application-limit-wait="waiting"]').waitFor();
    const deadline = await panel
      .locator('[data-application-limit-until]')
      .getAttribute('data-application-limit-until');
    await native
      .locator('#experience')
      .fill('Later owner answer after refused Send.');
    await native
      .locator('[data-qa="vacancy-response-form-letter-input"]')
      .fill('Later owner letter after refused Send.');
    await controls.page.waitForFunction(() =>
      document
        .querySelector('[data-application-draft]')
        ?.textContent.includes('Later owner answer after refused Send.')
    );
    await controls.locales('[data-application-daily-rejection="recorded"]');
    await controls.phone();
    await shot('phone');
    assert.equal(
      await native.evaluate(() => globalThis.applicationAttempts),
      1
    );
    clock.value = Date.parse(deadline);
    await panel.locator('[data-application-limit-wait="review"]').waitFor();
    await panel
      .locator('[data-application-daily-rejection="released"]')
      .waitFor();
    assert.equal(
      await native.locator('#experience').inputValue(),
      'Later owner answer after refused Send.'
    );
    assert.equal(
      await native
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .inputValue(),
      'Later owner letter after refused Send.'
    );
    assert.equal(
      await native.evaluate(() => globalThis.applicationAttempts),
      0
    );
    assert.equal(await action('submit').isDisabled(), true);
    await controls.page.setViewportSize({ width: 1180, height: 950 });
    await shot('after');
    await controls.locales('[data-application-daily-rejection="released"]');
    await controls.close(native);
    return {
      issuedSends: 1,
      automaticResends: 0,
      verifiedRefreshes: 1,
      laterAnswerAndLetterRestored: true,
      separateSendConfirmation: true,
      locales: 4,
      phone: true,
      errors: fixture.errors,
    };
  } catch (error) {
    await shot('failed');
    throw error;
  } finally {
    await fixture.close();
  }
};
