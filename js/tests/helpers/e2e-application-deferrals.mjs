import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { listAnswerRules } from '../../src/automation/question-store.js';
import {
  nativeApplicationReviewRequest as request,
  nativeApplicationForm,
  openNativeAnsweredApplication,
} from './application-native-request.mjs';

export const verifyNativeApplicationDeferral = async (browser) => {
  const fixture = await applicationNativeFixture(browser);
  try {
    let { receipt, page: owned } = await openNativeAnsweredApplication(
      fixture,
      browser,
      {
        experience: 'Owner-only questionnaire answer.',
        letter: 'Actual edited owner letter.',
      }
    );
    receipt = await request(fixture, 'defer', receipt, { confirm: true });
    assert.equal(receipt.state, 'closed');
    assert(owned.isClosed());
    const rows = await fixture.store.query();
    const answers = rows.find((row) =>
      row.id.startsWith('secret:jobs-application-answers:')
    );
    assert.deepEqual(
      answers.fields.map((row) => row.value),
      ['Owner-only questionnaire answer.', 'Actual edited owner letter.']
    );
    assert.equal(answers.draftId, receipt.draft.id);
    assert(
      (await listAnswerRules(fixture.store)).some((rule) =>
        rule.answers.some(
          (answer) =>
            answer.text === 'Owner-only questionnaire answer.' &&
            !answer.approved
        )
      )
    );
    const page = fixture.page;
    page.setDefaultTimeout(10000);
    await page.goto(`${fixture.base}/#/cv`);
    const panel = page.locator('[data-application-panel]');
    const retry = panel.locator('[data-application-action="retry"]');
    await retry.waitFor();
    assert(await retry.isDisabled());
    await panel.locator('[data-application-option="confirm"]').check();
    await retry.click();
    await panel.locator('[data-application-state="review"]').waitFor();
    owned = nativeApplicationForm(browser);
    assert.equal(await owned.locator('#experience').inputValue(), '');
    assert.equal(await owned.evaluate(() => globalThis.applicationEntries), 0);
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await owned.locator('[data-qa="add-cover-letter"]').click();
    await panel.locator('[data-application-action="read"]').click();
    await panel.locator('[data-application-state="review"]').waitFor();
    assert(
      await panel.locator('[data-application-action="restore"]').isDisabled()
    );
    await panel.locator('[data-application-option="confirm"]').check();
    await panel.locator('[data-application-action="restore"]').click();
    await panel
      .locator('[data-application-restoration="restored"]')
      .waitFor({ state: 'attached' });
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Owner-only questionnaire answer.'
    );
    assert.equal(
      await owned
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .inputValue(),
      'Actual edited owner letter.'
    );
    assert.equal(await owned.locator('#header').inputValue(), 'Owner header');
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await panel.locator('[data-application-action="close"]').click();
    await panel.locator('[data-application-state="closed"]').waitFor();
    assert(fixture.records.every((row) => row.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      actualBackup: 2,
      unapprovedKnowledge: true,
      queueReload: true,
      reviewOnlyRetry: true,
      explicitlyRestored: 2,
      submissions: 0,
      ownedBrowsersClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
