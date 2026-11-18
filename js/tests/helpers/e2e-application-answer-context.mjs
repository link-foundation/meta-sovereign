import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import {
  applicationAnswerQuestionnaire,
  seedApplicationAnswerContext,
} from '../../../experiments/issue-56/application-answer-context-fixture.mjs';
import { configureApplicationAnswerContext } from '../../../experiments/issue-56/application-answer-context-ui.mjs';
import { saveAnswerProfile } from '../../src/automation/question-profiles.js';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

export const verifyNativeApplicationAnswerContext = async (browser) => {
  const fixture = await applicationNativeFixture(browser, {
    questionLabel: applicationAnswerQuestionnaire,
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  try {
    const profile = await seedApplicationAnswerContext(fixture.store);
    await controls.select();
    await configureApplicationAnswerContext(panel);
    await panel.locator('[data-application-option="autoExact"]').check();
    await panel.locator('[data-application-delay]').fill('0');
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const owned = nativeApplicationForm(browser);
    const proposal = panel.locator('[data-form-answer="assembled"]').first();
    await proposal.waitFor();
    for (const value of [
      '$6 200',
      '530 000 ₽',
      'owner@example.test',
      'https://github.com/example-owner',
    ]) {
      assert((await proposal.innerText()).includes(value), value);
    }
    await controls.confirmed('prefill');
    assert.equal(await owned.locator('#experience').inputValue(), '');
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    const updated = await saveAnswerProfile(fixture.store, {
      ...profile,
      values: { ...profile.values, email: 'current@example.test' },
    });
    await action('read').click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-form-answer="assembled"]')
        ?.textContent.includes('current@example.test')
    );
    await page.reload();
    await panel.locator('[data-application-state="review"]').waitFor();
    assert(
      (
        await panel.locator('[data-application-answer-receipt]').innerText()
      ).includes('$6 200')
    );
    assert((await proposal.innerText()).includes('current@example.test'));
    assert(!(await proposal.innerText()).includes('owner@example.test'));
    const saved = await page.evaluate(() =>
      JSON.parse(
        globalThis.localStorage.getItem('meta-sovereign:hh-application-intent')
      )
    );
    assert.deepEqual(Object.keys(saved).sort(), [
      'browserSlot',
      'requestId',
      'url',
    ]);
    await controls.locales('[data-application-answer-receipt]');
    await controls.phone();
    await owned
      .locator('#experience')
      .fill('Owner reviewed every assembled answer.');
    await action('read').click();
    await controls.confirmed('submit');
    await panel
      .locator('[data-application-delivery="provider-confirmed"]')
      .waitFor();
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 1);
    await controls.close(owned);
    return {
      profileRevision: updated.revision,
      currencies: ['USD', 'RUB'],
      components: 4,
      automaticWrites: 0,
      automaticSubmissions: 0,
      reviewedSubmissions: 1,
      identityOnlyRecovery: true,
      locales: 4,
      ownedBrowserClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
