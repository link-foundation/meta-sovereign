import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { changeApplicationHoldFixture } from '../../../experiments/issue-56/application-hold-dom.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

export const verifyNativeApplicationLimits = async (
  browser,
  { screenshots, before = false, backup = false } = {}
) => {
  const clock = { value: Date.UTC(2026, 10, 14) };
  const fixture = await applicationNativeFixture(browser, {
    application: { now: () => clock.value },
  });
  const controls = applicationPanelBrowser(fixture);
  const { panel, action } = controls;
  const shot = controls.screenshot(
    screenshots,
    backup ? 'application-limit-drafts' : 'application-limits'
  );
  try {
    await controls.select();
    await panel.locator('[data-application-option="supervised"]').check();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const owned = nativeApplicationForm(browser);
    assert(owned);
    await owned
      .locator('#experience')
      .fill('Owner answer retained during the daily pause.');
    await owned.locator('[data-qa="add-cover-letter"]').click();
    await owned
      .locator('[data-qa="vacancy-response-form-letter-input"]')
      .fill('Owner letter retained during the daily pause.');
    await owned.evaluate(() => {
      const hidden = document.createElement('div');
      hidden.id = 'hidden-limit';
      hidden.hidden = true;
      hidden.setAttribute(
        'data-qa-popup-error-code',
        'negotiations-limit-exceeded'
      );
      document.querySelector('#native-form').append(hidden);
    });
    await controls.confirmed('read');
    assert.equal(
      await panel.locator('[data-application-limit]').count(),
      0,
      'A hidden limit must not start a pause.'
    );
    await owned.locator('#hidden-limit').evaluate((node) => node.remove());
    await owned.evaluate(changeApplicationHoldFixture, 'daily-limit');
    await controls.confirmed('read');
    await owned.evaluate(changeApplicationHoldFixture, 'clear');
    await controls.confirmed('read');
    await controls.confirm();
    if (before) {
      await shot('before');
    }
    assert.equal(
      await panel.locator('[data-application-limit="waiting"]').count(),
      1,
      'Durable daily application pause is missing.'
    );
    const deadline = await panel
      .locator('[data-application-limit-until]')
      .getAttribute('data-application-limit-until');
    for (const name of ['answers', 'letter', 'submit', 'restore']) {
      assert.equal(await action(name).isDisabled(), true, name);
    }
    assert.equal(owned.isClosed(), false);
    if (backup) {
      const draft = panel.locator('[data-application-draft]');
      assert.equal(
        await draft.count(),
        1,
        'Daily-limit recovery draft is missing.'
      );
      assert.equal(
        await draft.locator('[data-application-limit-draft]').count(),
        1
      );
      const values = await draft.textContent();
      assert(values.includes('Owner answer retained during the daily pause.'));
      assert(values.includes('Owner letter retained during the daily pause.'));
      await draft.locator('summary').click();
    }
    await shot('after');
    await controls.locales('[data-application-limit="waiting"]', async () => {
      assert.equal(
        await panel
          .locator('[data-application-limit-until]')
          .getAttribute('data-application-limit-until'),
        deadline
      );
      await controls.confirm();
      assert.equal(await action('submit').isDisabled(), true);
      if (backup) {
        assert.equal(
          await panel.locator('[data-application-limit-draft]').count(),
          1
        );
      }
    });
    await controls.phone();
    await shot('phone');
    clock.value = Date.parse(deadline);
    await controls.confirmed('read');
    await panel.locator('[data-application-limit="elapsed"]').waitFor();
    assert.equal(
      await panel.locator('[data-application-hold="daily-limit"]').count(),
      1
    );
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Owner answer retained during the daily pause.'
    );
    assert.equal(
      await owned
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .inputValue(),
      'Owner letter retained during the daily pause.'
    );
    const counters = await owned.evaluate(() => ({
      entries: globalThis.applicationEntries,
      sends: globalThis.applicationAttempts,
    }));
    assert.deepEqual(counters, { entries: 1, sends: 0 });
    await controls.close(owned);
    return {
      ...counters,
      hiddenLimitIgnored: true,
      dismissedLimitHeld: true,
      originalDeadlineRetained: true,
      locales: 4,
      ownerValuesPreserved: true,
      automaticBackup: backup,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
