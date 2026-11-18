import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationInput,
  applicationPageFixture,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationState } from '../src/jobs/application-options.js';
import { applicationResult } from '../src/jobs/application-result.js';

import {
  readHeldApplication as read,
  prefillHeldApplication as prefill,
  ownHeldApplication as owned,
  submitHeldApplication as submit,
  verifyUncertainHold,
} from '../../experiments/issue-56/application-hold-fixture.mjs';

test('a rendered résumé warning has a distinct state without hiding delivery or challenge boundaries', () => {
  const page = { ...applicationPageFixture(), resumeNotVisible: true };
  assert.equal(applicationState(page), 'resume-not-visible');
  assert.equal(applicationState({ ...page, bound: false }), 'wrong-page');
  assert.equal(applicationState({ ...page, delivered: true }), 'delivered');
  assert.equal(applicationState({ ...page, challenge: true }), 'verification');
  assert.equal(applicationState({ ...page, dailyLimit: true }), 'daily-limit');
});

test(
  'a résumé warning retains owner answers and refuses manual/automatic sending and automatic deferral',
  { timeout: 3000 },
  async (t) => {
    const { fixture, receipt: initial } = await owned(t);
    fixture.state.fields[1].value = 'Owner answer remains private.';
    fixture.state.page.resumeNotVisible = true;
    let receipt = await read(fixture, initial);
    assert.equal(receipt.state, 'resume-not-visible');
    assert.equal(receipt.hold, 'resume-not-visible');
    assert.equal(receipt.delivery, 'none');
    assert.equal(receipt.attempted.submit, false);
    await assert.rejects(prefill(fixture, receipt), {
      code: 'jobs-application-state',
    });
    await assert.rejects(submit(fixture, receipt), {
      code: 'jobs-application-state',
    });
    receipt = await fixture.service['application-mode'](
      identity(receipt, { noQuestionnaires: true })
    );
    assert.equal(receipt.active, true);
    assert.equal(
      (await fixture.service['application-queue']({})).entries.length,
      0
    );
    assert.equal(
      fixture.state.fields[1].value,
      'Owner answer remains private.'
    );
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.closed, 0);
    applicationResult(receipt, applicationInput);
  }
);

test(
  'a late résumé warning refuses dispatch before reservation and dismissal requires a separate manual send',
  { timeout: 3000 },
  async (t) => {
    const { fixture, receipt: initial } = await owned(t);
    fixture.state.fields[1].value = 'Reviewed answer';
    let receipt = await read(fixture, initial);
    fixture.state.page.resumeNotVisible = true;
    await assert.rejects(submit(fixture, receipt), {
      code: 'jobs-application-changed',
    });
    fixture.state.page.resumeNotVisible = false;
    receipt = await read(fixture, receipt);
    receipt = await prefill(fixture, receipt);
    assert.equal(receipt.hold, 'resume-not-visible');
    assert.equal(receipt.exact, true);
    assert.equal(receipt.attempted.submit, false);
    assert.equal(receipt.delivery, 'none');
    assert.equal(fixture.state.submitted, 0);
    await assert.rejects(submit(fixture, receipt, { automatic: true }), {
      code: 'jobs-application-exact',
    });
    receipt = await submit(fixture, receipt);
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.equal(receipt.hold, null);
    assert.equal(fixture.state.submitted, 1);
  }
);

test(
  'a résumé warning during the exact-answer delay cancels sending and retains its hold',
  { timeout: 3000 },
  async (t) => {
    const { fixture } = await owned(t, {
      application: {
        trace: ({ event }) => {
          if (event === 'application-review-delay') {
            fixture.state.page.resumeNotVisible = true;
          }
        },
      },
    });
    let receipt = await fixture.service['application-status'](applicationInput);
    receipt = await prefill(fixture, receipt);
    assert.equal(receipt.state, 'resume-not-visible');
    assert.equal(receipt.hold, 'resume-not-visible');
    assert.equal(receipt.attempted.submit, false);
    assert.equal(receipt.delivery, 'none');
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a résumé warning after an issued send never releases uncertain delivery or authorizes another attempt',
  { timeout: 3000 },
  (t) => verifyUncertainHold(t, 'resumeNotVisible', true, 'resume-not-visible')
);

test(
  'shared receipts accept legacy absence and boolean résumé observations, refusing arbitrary values',
  { timeout: 3000 },
  async (t) => {
    const { receipt } = await owned(t);
    for (const value of [undefined, false, true]) {
      applicationResult(
        { ...receipt, page: { ...receipt.page, resumeNotVisible: value } },
        applicationInput
      );
    }
    for (const value of ['true', null, 1, {}]) {
      assert.throws(() =>
        applicationResult(
          { ...receipt, page: { ...receipt.page, resumeNotVisible: value } },
          applicationInput
        )
      );
    }
  }
);
