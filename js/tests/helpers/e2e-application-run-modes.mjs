import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import {
  nativeApplicationReviewRequest,
  nativeApplicationForm,
} from './application-native-request.mjs';

export const verifyNativeApplicationRunModes = async (browser) => {
  const fixture = await applicationNativeFixture(browser);
  const request = (operation, receipt, extra) =>
    nativeApplicationReviewRequest(fixture, operation, receipt, extra);
  try {
    let receipt = await request('open');
    receipt = await request('mode', receipt, {
      noQuestionnaires: true,
      paused: true,
    });
    assert.equal(receipt.state, 'paused');
    await request('close', receipt);
    assert(fixture.records.every((row) => row.closed));
    receipt = await request('open', null, { recover: true });
    assert.equal(
      receipt.noQuestionnaires,
      true,
      'native reopening retains the worker questionnaire policy'
    );
    assert.equal(
      receipt.paused,
      true,
      'native reopening retains the worker pause'
    );
    assert.equal(receipt.state, 'paused');
    receipt = await request('mode', receipt, { paused: false });
    assert.equal(receipt.state, 'ready');
    receipt = await request('advance', receipt, {
      action: 'enter',
      confirm: true,
    });
    assert.equal(receipt.state, 'deferred');
    assert.equal(receipt.noQuestionnaires, true);
    assert.equal(receipt.attempted.submit, false);
    const page = nativeApplicationForm(browser);
    assert.equal(await page.locator('#experience').inputValue(), '');
    assert.equal(await page.locator('#header').inputValue(), 'Owner header');
    assert.equal(await page.evaluate(() => globalThis.applicationAttempts), 0);
    receipt = await request('mode', receipt, { noQuestionnaires: false });
    assert.equal(receipt.state, 'review');
    await request('close', receipt);
    assert(fixture.records.every((row) => row.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      workerPauseRetained: true,
      workerQuestionnairePolicyRetained: true,
      deferred: true,
      resumedReviewOnly: true,
      ownerHeaderPreserved: true,
      submissions: 0,
      browsersClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
