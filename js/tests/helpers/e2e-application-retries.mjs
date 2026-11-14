import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { rejectNativeApplication } from '../../../experiments/issue-56/application-retry-dom.mjs';
import { applicationRetryMs } from '../../src/jobs/application-retries.js';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';
import {
  openNativeAnsweredApplication,
  nativeApplicationReviewRequest as request,
  nativeApplicationRequest,
  nativeApplicationForm,
  nativeApplicationQueue,
} from './application-native-request.mjs';

export const verifyNativeApplicationRetries = async (browser) => {
  const clock = { value: Date.UTC(2026, 10, 14), rejections: 0 };
  const fixture = await applicationNativeFixture(browser, {
    application: { now: () => clock.value },
  });
  try {
    const opened = await openNativeAnsweredApplication(fixture, browser, {
      experience: 'Owner-only questionnaire answer.',
      letter: 'Actual edited owner letter.',
    });
    await rejectNativeApplication(opened.page, clock);
    const closed = await request(fixture, 'advance', opened.receipt, {
      action: 'submit',
      confirm: true,
    });
    assert.equal(closed.state, 'closed');
    assert(opened.page.isClosed());
    assert.equal(clock.rejections, 1);
    assert.equal(closed.delivery, 'unknown');
    assert.equal(closed.attempted.submit, true);
    assert.equal(closed.draft.fields[1].value, 'Actual edited owner letter.');
    const rejection = (await fixture.store.query()).find((row) =>
      row.id.startsWith('secret:jobs-application-rejection:')
    );
    assert.equal(rejection.requestId, closed.requestId);
    assert.equal(rejection.draftId, closed.draft.id);
    assert.equal(rejection.attempted.submit, true);
    assert.equal(rejection.delivery, 'unknown');
    let queue = await nativeApplicationQueue(fixture);
    const entry = queue.entries[0];
    assert.equal(entry.ready, false);
    assert.equal(Date.parse(entry.retryAt) - clock.value, applicationRetryMs);
    clock.value += applicationRetryMs;
    queue = await nativeApplicationQueue(fixture);
    assert.equal(queue.entries[0].ready, true);
    let receipt = await nativeApplicationRequest(fixture, 'retry', {
      ...applicationInput,
      queueId: entry.id,
      confirm: true,
    });
    assert.equal(receipt.state, 'review');
    assert.equal(receipt.attempted.submit, false);
    assert.deepEqual(await fixture.store.get(rejection.id), rejection);
    const page = nativeApplicationForm(browser);
    assert.equal(await page.locator('#experience').inputValue(), '');
    assert.equal(await page.evaluate(() => globalThis.applicationEntries), 0);
    assert.equal(await page.evaluate(() => globalThis.applicationAttempts), 0);
    await page.locator('[data-qa="add-cover-letter"]').click();
    receipt = await request(fixture, 'read', receipt);
    receipt = await request(fixture, 'restore', receipt, { confirm: true });
    assert.equal(receipt.restoration.applied, 2);
    assert.equal(await page.locator('#header').inputValue(), 'Owner header');
    assert.equal(
      await page.locator('#experience').inputValue(),
      'Owner-only questionnaire answer.'
    );
    assert.equal(await page.evaluate(() => globalThis.applicationAttempts), 0);
    receipt = await request(fixture, 'advance', receipt, {
      action: 'submit',
      confirm: true,
    });
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.equal(await page.evaluate(() => globalThis.applicationAttempts), 1);
    await request(fixture, 'close', receipt);
    assert(fixture.records.every((record) => record.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      nativeRejections: clock.rejections,
      backedAnswers: 2,
      fiveHourBoundary: true,
      reviewOnlyReopen: true,
      separatelyConfirmedRetry: true,
      originalFailureRetained: true,
      browsersClosed: true,
      pageErrors: fixture.errors,
    };
  } finally {
    await fixture.close();
  }
};
