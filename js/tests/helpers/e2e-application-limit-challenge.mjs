import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { changeApplicationHoldFixture } from '../../../experiments/issue-56/application-hold-dom.mjs';
import { mountApplicationLimitChallenge } from '../../../experiments/issue-56/application-limit-challenge-dom.mjs';
import { applicationLimitBrowser } from './application-limit-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { readFormDocument } from '../../src/forms/read-document.js';
import { verifyNativeApplicationLimitBoundaries } from './e2e-application-limit-boundaries.mjs';

export const verifyNativeApplicationLimitChallenge = async (
  browser,
  { screenshots = process.env.E2E_ARTIFACT_DIR, checkBoundaries = true } = {}
) => {
  const boundaries = checkBoundaries
    ? await verifyNativeApplicationLimitBoundaries(browser)
    : null;
  const { fixture, clock, controls, panel, action, shot } =
    await applicationLimitBrowser(
      browser,
      screenshots,
      'application-limit-challenge'
    );
  try {
    await controls.select();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const owned = nativeApplicationForm(browser);
    await owned
      .locator('#experience')
      .fill('Actual owner answer before native close.');
    await owned.locator('[data-qa="add-cover-letter"]').click();
    await owned
      .locator('[data-qa="vacancy-response-form-letter-input"]')
      .fill('Complete owner cover letter.');
    await owned.evaluate(changeApplicationHoldFixture, 'daily-limit');
    await owned.evaluate(mountApplicationLimitChallenge);
    assert((await owned.evaluate(readFormDocument)).challenge.active);
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await owned.screenshot({
        path: `${screenshots}/application-limit-challenge-native-before.png`,
      });
    }
    await controls.confirmed('read');
    const draft = panel.locator('[data-application-draft]');
    assert.equal(
      await draft.count(),
      1,
      'Coexisting CAPTCHA prevented the acknowledged daily-limit draft.'
    );
    assert(
      (await draft.textContent()).includes(
        'Actual owner answer before native close.'
      )
    );
    assert(
      (await draft.textContent()).includes('Complete owner cover letter.')
    );
    assert.equal(
      await owned.locator('#limit-captcha').count(),
      0,
      'The backed native gate was not dismissed.'
    );
    const deadline = await panel
      .locator('[data-application-limit-until]')
      .getAttribute('data-application-limit-until');
    await controls.confirm();
    await action('wait-limit').click();
    await panel.locator('[data-application-limit-wait="waiting"]').waitFor();
    await owned
      .locator('#experience')
      .fill('Later owner answer under the same pause.');
    await owned.evaluate(mountApplicationLimitChallenge);
    await owned.locator('[data-qa-popup-error-code]').evaluate((node) => {
      node.hidden = true;
    });
    await owned.locator('#limit-captcha').waitFor({ state: 'detached' });
    await controls.page.waitForFunction(() =>
      document
        .querySelector('[data-application-draft]')
        ?.textContent.includes('Later owner answer under the same pause.')
    );
    assert.equal(
      await panel
        .locator('[data-application-limit-until]')
        .getAttribute('data-application-limit-until'),
      deadline
    );
    assert.equal(await owned.evaluate(() => globalThis.limitCaptchaCloses), 2);
    const rows = await fixture.store.query();
    assert(
      rows.some(
        (row) =>
          row.id.startsWith('secret:jobs-application-answers:') &&
          row.pairs.some(
            (pair) => pair.text === 'Later owner answer under the same pause.'
          )
      )
    );
    await shot('after');
    if (screenshots) {
      await owned.screenshot({
        path: `${screenshots}/application-limit-challenge-native-after.png`,
      });
    }
    // End the confirmed wait at its original finite deadline, without a navigation.
    clock.value = Date.parse(deadline);
    await panel.locator('[data-application-limit-wait="review"]').waitFor();
    assert.deepEqual(
      await owned.evaluate(() => ({
        closes: globalThis.limitCaptchaCloses,
        actions: globalThis.limitCaptchaActions,
        sends: globalThis.applicationAttempts,
      })),
      { closes: 2, actions: 0, sends: 0 }
    );
    await controls.close(owned);
    return {
      boundaries,
      closes: 2,
      challengeContentReads: 0,
      challengeActions: 0,
      sends: 0,
      savedBeforeClose: true,
      remounted: true,
      originalDeadline: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
