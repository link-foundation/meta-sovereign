import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { listAnswerRules } from '../../src/automation/question-store.js';
import {
  nativeApplicationReviewRequest as request,
  nativeApplicationForm,
  openNativeAnsweredApplication,
} from './application-native-request.mjs';

export const verifyNativeApplicationDraft = async (browser) => {
  const fixture = await applicationNativeFixture(browser);
  const owned = () => nativeApplicationForm(browser);
  const answers = {
    experience: 'Owner-only questionnaire answer.',
    letter: 'Actual edited owner letter.',
  };
  try {
    const knowledge = await listAnswerRules(fixture.store);
    let { receipt, page } = await openNativeAnsweredApplication(
      fixture,
      browser,
      answers
    );
    receipt = await request(fixture, 'backup', receipt, { confirm: true });
    const saved = receipt.draft;
    assert.deepEqual(
      saved.fields.map((field) => field.value),
      Object.values(answers)
    );
    assert.equal(await page.evaluate(() => globalThis.applicationAttempts), 0);
    await request(fixture, 'close', receipt);
    assert(page.isClosed());
    receipt = await request(fixture, 'open', undefined, { recover: true });
    page = owned();
    assert.equal(await page.locator('#experience').inputValue(), '');
    assert.equal(await page.evaluate(() => globalThis.applicationEntries), 0);
    assert.deepEqual(receipt.draft, saved);
    // The owner explicitly opens the same optional letter field before restoring.
    await page.locator('[data-qa="add-cover-letter"]').click();
    receipt = await request(fixture, 'read', receipt);
    receipt = await request(fixture, 'restore', receipt, { confirm: true });
    assert.equal(receipt.restoration.state, 'restored');
    assert.equal(receipt.restoration.applied, 2);
    assert.equal(receipt.exact, false);
    assert.equal(
      await page.locator('#experience').inputValue(),
      answers.experience
    );
    assert.equal(
      await page
        .locator('[data-qa="vacancy-response-form-letter-input"]')
        .inputValue(),
      answers.letter
    );
    assert.equal(await page.locator('#header').inputValue(), 'Owner header');
    assert.equal(await page.evaluate(() => globalThis.applicationAttempts), 0);
    assert.deepEqual(await listAnswerRules(fixture.store), knowledge);
    await request(fixture, 'close', receipt);
    assert(fixture.records.every((record) => record.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      backedUp: 2,
      restored: 2,
      ownerHeader: 'preserved',
      recoveredEntry: 0,
      submissions: 0,
      learned: false,
      ownedBrowsersClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
