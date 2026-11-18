import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { changeUnavailableWarning } from '../../../experiments/issue-56/application-unavailable-dom.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { refuseNativeSubmit } from './application-native-guard.mjs';
import { LINO_BINARY, decodeWire } from '../../src/transport/lino.js';
import { vacancySkipResult } from '../../src/jobs/vacancy-skip-data.js';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';

export const verifyNativeVacancyUnavailable = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await applicationNativeFixture(browser, { popup: true });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const shot = controls.screenshot(screenshots, 'vacancy-unavailable');
  const ignored = [
    'hidden',
    'aria-hidden',
    'inert',
    'collapsed',
    'display-none',
    'visibility-hidden',
    'description',
    'owner',
    'form',
    'unrelated',
  ];
  try {
    await controls.select();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const owned = nativeApplicationForm(browser, applicationInput.url);
    await owned.locator('#experience').fill('Private owner answer');
    for (const kind of ignored) {
      await owned.evaluate(changeUnavailableWarning, kind);
      await controls.confirmed('read');
      await panel.locator('[data-application-state="review"]').waitFor();
    }
    await owned.evaluate(changeUnavailableWarning, 'russian');
    await controls.confirmed('read');
    if (before) {
      await shot('before');
    }
    assert.equal(
      await panel
        .locator('[data-application-state="vacancy-unavailable"]')
        .count(),
      1
    );
    await controls.confirm();
    assert.equal(await action('submit').isDisabled(), true);
    assert.equal(await action('prefill').isDisabled(), true);
    await shot('after');
    await controls.phone();
    await shot('phone');
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const kind of [
      'russian',
      'english',
      'english-alternative',
      'split',
      'long',
    ]) {
      await owned.evaluate(changeUnavailableWarning, kind);
      await controls.confirmed('read');
      await refuseNativeSubmit(owned, applicationInput.url, (snapshot) => {
        assert.equal(snapshot.vacancyUnavailable, true);
      });
    }
    const stored = await fetch(`${fixture.base}/api/vacancies/skips-stored`, {
      headers: { accept: LINO_BINARY },
    });
    assert.equal(stored.status, 200);
    const skips = vacancySkipResult(
      decodeWire(await stored.arrayBuffer(), stored.headers.get('content-type'))
    );
    assert.equal(skips.entries[0].reason, 'vacancy_unavailable');
    assert.equal(skips.entries[0].attempts, 1);
    await controls.locales('[data-application-state="vacancy-unavailable"]');
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Private owner answer'
    );
    await owned.evaluate(changeUnavailableWarning, 'clear');
    await controls.confirmed('read');
    await panel
      .locator('[data-application-hold="vacancy-unavailable"]')
      .waitFor();
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await controls.close(owned);
    const vacancies = page.locator('[data-vacancies]');
    await vacancies.locator('[data-vacancy-skip-action="reload"]').click();
    const entry = vacancies.locator('[data-vacancy-skip]');
    await entry.waitFor();
    await vacancies
      .locator('[data-vacancy-skip-action="clear-vacancy_unavailable"]')
      .click();
    await vacancies.locator('[data-vacancy-skip-empty]').waitFor();
    return {
      ignoredVariants: ignored.length,
      visibleVariants: 5,
      binaryLino: true,
      privateReason: true,
      manualClear: true,
      providerSubmissions: 0,
      resourcesClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
