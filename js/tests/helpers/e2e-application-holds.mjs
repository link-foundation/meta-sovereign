import assert from 'node:assert/strict';
import {
  applicationDocument,
  applicationSelectors,
} from '../../src/jobs/application-page.js';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { changeApplicationHoldFixture } from '../../../experiments/issue-56/application-hold-dom.mjs';
import {
  nativeApplicationReviewRequest,
  nativeApplicationForm,
  nativeApplicationQueue,
} from './application-native-request.mjs';

export const verifyNativeApplicationHolds = async (browser) => {
  const fixture = await applicationNativeFixture(browser);
  const request = (operation, receipt, extra) =>
    nativeApplicationReviewRequest(fixture, operation, receipt, extra);
  try {
    let receipt = await request('open', null, {
      autoExact: true,
      reviewDelayMs: 0,
    });
    receipt = await request('advance', receipt, {
      action: 'enter',
      confirm: true,
    });
    const page = nativeApplicationForm(browser);
    await page.evaluate(() => {
      const unrelated = document.createElement('div');
      unrelated.id = 'unrelated-alert';
      unrelated.setAttribute('role', 'alert');
      unrelated.textContent = 'An error occurred, please try again';
      document.body.prepend(unrelated);
      const hidden = document.createElement('div');
      hidden.id = 'hidden-error';
      hidden.hidden = true;
      hidden.setAttribute('data-qa-popup-error-code', 'unknown');
      document.querySelector('#native-form').append(hidden);
    });
    receipt = await request('read', receipt);
    assert.equal(receipt.state, 'review');
    assert.equal(
      receipt.hold ?? null,
      null,
      'hidden errors and unrelated alerts do not latch an application hold'
    );
    await page.evaluate(() => {
      document.querySelector('#unrelated-alert').remove();
      document.querySelector('#hidden-error').remove();
    });
    receipt = await request('read', receipt);
    await page.evaluate(changeApplicationHoldFixture, 'verification');
    receipt = await request('read', receipt);
    await page.evaluate(changeApplicationHoldFixture, 'clear');
    receipt = await request('read', receipt);
    receipt = await request('prefill', receipt, { confirm: true });
    assert.equal(
      await page.evaluate(() => globalThis.applicationAttempts),
      0,
      'dismissed verification must not enable automatic sending'
    );
    assert.equal(receipt.hold, 'verification');
    assert.equal(receipt.exact, true);
    for (const kind of [
      'generic-error',
      'validation-error',
      'generic-text-ru',
      'generic-text-en',
      'daily-limit',
    ]) {
      await page.evaluate(changeApplicationHoldFixture, kind);
      receipt = await request('read', receipt);
      const reason = kind.startsWith('generic-') ? 'generic-error' : kind;
      assert.equal(receipt.hold, reason);
      assert.equal(
        receipt.state,
        kind === 'daily-limit' ? 'daily-limit' : 'provider-error'
      );
      const handle = await page.$(applicationSelectors.submit);
      try {
        const snapshot = await handle.evaluate(applicationDocument, {
          url: receipt.url,
          selectors: applicationSelectors,
        });
        const result = await handle.evaluate(applicationDocument, {
          url: receipt.url,
          selectors: applicationSelectors,
          action: 'submit',
          guard: JSON.stringify(snapshot),
        });
        assert.equal(
          result.dispatched,
          false,
          'visible native errors refuse synchronous dispatch even with an otherwise matching snapshot'
        );
      } finally {
        await handle.dispose();
      }
      await page.evaluate(changeApplicationHoldFixture, 'clear');
      receipt = await request('read', receipt);
      assert.equal(receipt.hold, reason);
      receipt = await request('mode', receipt, { noQuestionnaires: true });
      assert.equal(receipt.active, true);
      assert.equal((await nativeApplicationQueue(fixture)).entries.length, 0);
      receipt = await request('mode', receipt, { noQuestionnaires: false });
      receipt = await request('prefill', receipt, { confirm: true });
      assert.equal(
        await page.evaluate(() => globalThis.applicationAttempts),
        0
      );
    }
    assert.equal(
      await page.locator('#experience').inputValue(),
      'Five years building Python services.'
    );
    assert.equal(await page.locator('#header').inputValue(), 'Owner header');
    receipt = await request('advance', receipt, {
      action: 'submit',
      confirm: true,
    });
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.equal(receipt.hold, null);
    assert.equal(await page.evaluate(() => globalThis.applicationAttempts), 1);
    await request('close', receipt);
    assert(fixture.records.every((row) => row.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      bannerDismissalDoesNotSend: true,
      nativeErrorKinds: 6,
      automaticDeferralHeld: true,
      confirmedDeliveryClearsHold: true,
      submissions: 1,
      browsersClosed: true,
      errors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
