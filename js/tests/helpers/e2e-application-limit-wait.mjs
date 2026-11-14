import assert from 'node:assert/strict';
import { changeApplicationHoldFixture } from '../../../experiments/issue-56/application-hold-dom.mjs';
import { applicationLimitBrowser } from './application-limit-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { verifyApplicationLimitRefreshGuards } from './e2e-application-limit-guards.mjs';

export const verifyNativeApplicationLimitWait = async (
  browser,
  { screenshots, before = false, restore = false } = {}
) => {
  const { fixture, clock, controls, panel, action, shot } =
    await applicationLimitBrowser(
      browser,
      screenshots,
      restore ? 'application-limit-restore' : 'application-limit-wait'
    );
  try {
    await controls.select();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const owned = nativeApplicationForm(browser);
    // Reloading an already canonical form still requires a new document.
    await owned.evaluate(() =>
      globalThis.history.replaceState(
        {},
        '',
        `${globalThis.location.href}&startedWithQuestion=false`
      )
    );
    await owned
      .locator('#experience')
      .fill('Original owner answer before waiting.');
    if (restore) {
      await owned.locator('[data-qa="add-cover-letter"]').click();
      await owned
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .fill('Actual owner letter before waiting.');
    }
    await owned.evaluate(changeApplicationHoldFixture, 'daily-limit');
    await controls.confirmed('read');
    if (before) {
      await shot('before');
    }
    const waitAction = restore ? 'wait-limit-restore' : 'wait-limit';
    assert.equal(
      await action(waitAction).count(),
      1,
      restore
        ? 'Confirmed expiry restoration is missing.'
        : 'Confirmed daily-limit waiting is missing.'
    );
    assert(await action('wait-limit').isDisabled());
    const refusedNativeChanges =
      await verifyApplicationLimitRefreshGuards(owned);
    await controls.confirm();
    await action(waitAction).click();
    await panel.locator('[data-application-limit-wait="waiting"]').waitFor();
    const deadline = await panel
      .locator('[data-application-limit-until]')
      .getAttribute('data-application-limit-until');
    await owned
      .locator('#experience')
      .fill('Later native owner answer while waiting.');
    if (restore) {
      await owned
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .fill('Later owner letter while waiting.');
    }
    await controls.page.waitForFunction(() =>
      document
        .querySelector('[data-application-draft]')
        ?.textContent.includes('Later native owner answer while waiting.')
    );
    await shot('waiting');
    await controls.locales('[data-application-limit-wait="waiting"]');
    await controls.phone();
    await shot('phone');
    const counters = await owned.evaluate(() => ({
      entries: globalThis.applicationEntries,
      sends: globalThis.applicationAttempts,
    }));
    assert.deepEqual(counters, { entries: 1, sends: 0 });
    clock.value = Date.parse(deadline);
    await panel.locator('[data-application-limit-wait="review"]').waitFor();
    assert.equal(
      new URL(owned.url()).searchParams.get('startedWithQuestion'),
      'false'
    );
    assert.equal(
      await owned.locator('#experience').inputValue(),
      restore ? 'Later native owner answer while waiting.' : ''
    );
    assert(
      (await panel.locator('[data-application-draft]').textContent()).includes(
        'Later native owner answer while waiting.'
      )
    );
    await controls.page.setViewportSize({ width: 1180, height: 950 });
    await panel.locator('[data-application-draft] summary').click();
    await shot('after');
    if (!restore) {
      await controls.confirmed('restore');
    }
    if (restore) {
      assert.equal(
        await owned
          .locator('[data-qa="vacancy-response-form-letter-input"]')
          .inputValue(),
        'Later owner letter while waiting.'
      );
    }
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Later native owner answer while waiting.'
    );
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await controls.close(owned);
    return {
      ...counters,
      guardedRefreshes: 1,
      refusedNativeChanges,
      laterOwnerEditSaved: true,
      restorationSeparatelyConfirmed: !restore,
      restorationConfirmedWithWait: restore,
      locales: 4,
      errors: fixture.errors,
    };
  } catch (error) {
    console.error(
      '[application-limit-wait-failure]',
      await panel
        .locator('[data-application-limit-wait]')
        .textContent({ timeout: 1000 })
        .catch(() => null)
    );
    await shot('failed');
    throw error;
  } finally {
    await fixture.close();
  }
};

export const verifyNativeApplicationLimitRestore = (browser, options = {}) =>
  verifyNativeApplicationLimitWait(browser, { ...options, restore: true });
