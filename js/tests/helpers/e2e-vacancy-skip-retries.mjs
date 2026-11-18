import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { vacancySkipId } from '../../src/jobs/vacancy-skip-data.js';

export const verifyVacancySkipRetryLocales = async (page, skips) => {
  await applicationPanelBrowser({ page }).locales(
    '[data-vacancy-skip-recovery="next-run"]',
    async (locale) => {
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.doesNotMatch(await skips.innerText(), /vacancySkip\./u);
    },
    skips
  );
};

export const clearVacancySkipReason = async (page, skips, row, reason) => {
  await skips.locator(`[data-vacancy-skip-action="clear-${reason}"]`).click();
  await row.waitFor({ state: 'detached' });
  await page.reload();
  await skips.locator('[data-vacancy-skip-empty]').waitFor();
};

/** Native DOM evidence, polling stability, translated recovery and explicit clear. */
export const verifyNativeVacancySkipRetries = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const outcomes = [];
  const fixture = await applicationNativeFixture(browser, {
    popup: true,
    onApplicationClose: (outcome) => outcomes.push(outcome),
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const skips = page.locator('[data-vacancy-skips="jobs"]');
  const row = skips.locator('[data-vacancy-skip="https://hh.ru/vacancy/123"]');
  const shot = controls.screenshot(screenshots, 'transient-vacancy-skips');
  try {
    await controls.select();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    const owned = nativeApplicationForm(browser, 'https://hh.ru/vacancy/123');
    const apply = owned.locator('[data-qa="vacancy-response-link-top"]');
    await apply.evaluate((button) => {
      button.disabled = true;
    });
    await controls.confirmed('read');
    const first = await fixture.store.get(vacancySkipId('jobs'));
    if (!before) {
      assert.equal(first?.entries[0].reason, 'apply_button_disabled');
      assert.equal(first.entries[0].attempts, 1);
    }
    await apply.evaluate((button) => {
      button.disabled = false;
    });
    await controls.confirmed('read');
    await controls.confirmed('enter');
    await owned.locator('#experience').fill('Owner answer remains private.');
    await owned
      .locator('[data-qa="vacancy-response-submit-popup"]')
      .evaluate((button) => {
        button.disabled = true;
      });
    await controls.confirmed('read');
    const observed = await fixture.store.get(vacancySkipId('jobs'));
    await controls.confirmed('read');
    assert.deepEqual(await fixture.store.get(vacancySkipId('jobs')), observed);
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Owner answer remains private.'
    );
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    if (before) {
      await shot('before');
    }
    assert.equal(
      observed?.entries[0].reason,
      'button_disabled',
      'disabled native Send must produce an acknowledged transient refusal'
    );
    assert.equal(
      observed.entries[0].attempts,
      1,
      'changing the reason in one run does not consume the later-run retry'
    );
    await controls.close(owned);
    await page.reload();
    await row.waitFor();
    await row.locator('[data-vacancy-skip-recovery="next-run"]').waitFor();
    await shot('after', skips);
    await controls.phone();
    await shot('phone', skips);
    await verifyVacancySkipRetryLocales(page, skips);
    await clearVacancySkipReason(page, skips, row, 'button_disabled');
    assert(outcomes.every((outcome) => outcome.attempts === 0));
    assert.deepEqual(fixture.errors, []);
    return {
      nativeDisabledControls: 2,
      stableReads: true,
      sameRunCount: 1,
      translatedLocales: 4,
      persistedRecovery: true,
      clearPersisted: true,
      privateAnswerPreserved: true,
      submissions: 0,
      resourcesClosed: true,
    };
  } finally {
    await fixture.close();
  }
};
