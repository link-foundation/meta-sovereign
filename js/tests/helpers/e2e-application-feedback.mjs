import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import {
  changeApplicationFeedbackFixture as change,
  readApplicationFeedbackFixture as read,
} from '../../../experiments/issue-56/application-feedback-dom.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

const verifyProtectedSurveys = async (owned) => {
  for (const kind of [
    'owner',
    'challenge',
    'daily-limit',
    'shared-reason',
    'hidden',
    'ambiguous',
    'unsafe-close',
  ]) {
    await owned.evaluate(change, kind);
    const current = await owned.evaluate(read);
    assert.equal(current.selections, 1, kind);
    assert.equal(current.closes, 1, kind);
    assert.equal(current.challengeReads, 0, kind);
    if (kind === 'owner') {
      assert.equal(current.owner, true);
    }
  }
  await owned.evaluate(change, 'late-challenge');
  assert.equal((await owned.evaluate(read)).closes, 1);
  await owned.evaluate(change, 'changed-close');
  assert.equal((await owned.evaluate(read)).closes, 1);
  await owned.evaluate(change, 'selected');
  await owned.waitForFunction(() => globalThis.feedbackFixture.closes === 2);
};

export const verifyNativeApplicationFeedback = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const modes = before ? ['automatic'] : ['automatic', 'manual', 'preview'];
  const results = [];
  for (const mode of modes) {
    const fixture = await applicationNativeFixture(browser);
    const controls = applicationPanelBrowser(fixture);
    const { page, panel, action } = controls;
    const shot = controls.screenshot(screenshots, 'application-feedback');
    try {
      await controls.select();
      if (before) {
        await shot('before');
      }
      assert.equal(
        await panel
          .locator('[data-application-option="autoAnswerViewedVacancy"]')
          .count(),
        1,
        'Viewed-vacancy survey policy must be configurable'
      );
      if (mode === 'automatic') {
        await shot('settings');
      }
      if (mode === 'manual') {
        await panel
          .locator('[data-application-option="autoAnswerViewedVacancy"]')
          .uncheck();
      }
      if (mode === 'preview') {
        await panel.locator('[data-application-option="testMode"]').check();
      }
      await action('start').click();
      await panel.locator('[data-application-state]').waitFor();
      const owned = nativeApplicationForm(browser, 'https://hh.ru/vacancy/123');
      assert(owned);
      await owned.evaluate(change, 'normal');
      if (mode === 'automatic') {
        await owned.waitForFunction(
          () => globalThis.feedbackFixture?.closes === 1
        );
        await verifyProtectedSurveys(owned);
        await owned.reload();
        await owned.evaluate(change, 'normal');
        await owned.waitForFunction(
          () => globalThis.feedbackFixture.closes === 1
        );
        await controls.locales(
          '[data-application-feedback-policy="automatic"]'
        );
        await shot('after');
        await controls.phone();
        await shot('phone');
      } else {
        const state = await owned.evaluate(read);
        assert.equal(state.selections, 0);
        assert.equal(state.closes, 0);
        assert.equal(state.option, false);
      }
      const state = await owned.evaluate(read);
      assert.equal(state.entries + state.submissions + state.challengeReads, 0);
      await controls.close(owned);
      await page.reload();
      const vacancies = page.locator('[data-vacancies]');
      await vacancies.locator('[data-vacancy-field="query"]').fill('Python');
      await vacancies.locator('[data-vacancy-action="search"]').click();
      await vacancies
        .locator('[data-vacancy-action="collect"]')
        .first()
        .click();
      await panel.locator('[data-application-state="interrupted"]').waitFor();
      assert(fixture.records.every((record) => record.closed));
      assert.deepEqual(fixture.errors, []);
      results.push({ mode, ...state, closed: true, recoveryReplay: false });
    } finally {
      await fixture.close();
    }
  }
  return results;
};
