import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import {
  nativeApplicationForm,
  nativeApplicationQueue,
} from './application-native-request.mjs';

/** One finite native review, a saved cross-slot wait, then explicit eligibility. */
export const verifyNativeApplicationPacing = async (browser) => {
  const clock = { value: Date.parse('2026-11-14T16:00:00.000Z') };
  const fixture = await applicationNativeFixture(browser, {
    application: { now: () => clock.value, pacingRandom: () => 0 },
  });
  const controls = applicationPanelBrowser(fixture);
  const { panel, action, page } = controls;
  const shot = controls.screenshot(
    process.env.APPLICATION_PACING_SCREENSHOTS ?? process.env.E2E_ARTIFACT_DIR,
    process.env.APPLICATION_PACING_SCREENSHOT_PREFIX ?? 'application-pacing'
  );
  try {
    await controls.select();
    await shot('settings');
    const enabled = panel.locator('[data-application-option="pacing"]');
    assert.equal(
      await enabled.count(),
      1,
      'The optional pacing control is absent.'
    );
    await enabled.check();
    await panel.locator('[data-application-pacing-interval]').fill('0');
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await action('queue').click();
    await panel.locator('[data-application-pacing="waiting"]').waitFor();
    const first = (await nativeApplicationQueue(fixture)).pacing;
    assert.equal(first.intervalMs, 120000);
    assert.equal(first.saved, true);
    const owned = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url() === 'https://hh.ru/vacancy/123');
    await controls.close(owned);
    await action('release').click();
    assert.equal(await action('start').isDisabled(), true);
    await shot('waiting');
    await controls.locales('[data-application-pacing="waiting"]', async () => {
      const vacancies = page.locator('[data-vacancies]');
      await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
      await vacancies.locator('[data-vacancy-action="search"]').click();
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .click();
      await panel.locator('[data-application-state="interrupted"]').waitFor();
      await action('release').click();
      assert.equal(await action('start').isDisabled(), true);
    });
    await controls.phone();
    await shot('phone');
    const beforeExpiry = fixture.records.length;
    clock.value = Date.parse(first.nextAt);
    await action('queue').click();
    await panel.locator('[data-application-pacing="ready"]').waitFor();
    assert.equal(await action('start').isEnabled(), true);
    assert.equal(
      fixture.records.length,
      beforeExpiry,
      'Expiry must not open a review.'
    );
    await shot('eligible');
    // Reloaded settings are intentionally local; opt in to the next review again.
    await enabled.check();
    await panel
      .locator('[data-application-option="autoSelectResumeLanguage"]')
      .uncheck();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    await panel.locator('[data-application-state="review"]').waitFor();
    const native = nativeApplicationForm(browser);
    // This is a manual owner click on the isolated native fixture, not automation.
    await native.locator('[type="submit"]').click();
    await action('read').click();
    await panel.locator('[data-application-state="delivered"]').waitFor();
    await action('queue').click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-application-pacing]')
        ?.textContent.includes('1')
    );
    const final = (await nativeApplicationQueue(fixture)).pacing;
    assert.equal(final.deliveries, 1);
    assert.equal(final.baseMs, 110000);
    assert.equal(
      await native.evaluate(() => globalThis.applicationAttempts),
      1
    );
    await shot('delivered');
    await controls.close(native);
    return {
      saved: true,
      intervalMs: first.intervalMs,
      locales: 4,
      phone: true,
      expiryOpened: false,
      nativeDeliveries: final.deliveries,
      automaticSends: 0,
      browsersClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
