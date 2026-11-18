import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { deferralStorageFault } from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationResult } from '../src/jobs/application-result.js';

import {
  readHeldApplication as read,
  prefillHeldApplication as prefill,
  ownHeldApplication as owned,
  submitHeldApplication as submit,
  verifyUncertainHold,
} from '../../experiments/issue-56/application-hold-fixture.mjs';

test(
  'dismissing a verification banner cannot enable exact automatic sending',
  { timeout: 3000 },
  async (t) => {
    const setup = await owned(t);
    const { fixture } = setup;
    let { receipt } = setup;
    fixture.state.page.challenge = true;
    receipt = await read(fixture, receipt);
    fixture.state.page.challenge = false;
    receipt = await read(fixture, receipt);
    receipt = await prefill(fixture, receipt);
    assert.equal(
      fixture.state.submitted,
      0,
      'a dismissed verification hold still requires a separate manual send'
    );
    assert.equal(receipt.hold, 'verification');
    assert.equal(receipt.exact, true);
    assert.equal(receipt.attempted.submit, false);
    await assert.rejects(submit(fixture, receipt, { automatic: true }), {
      code: 'jobs-application-exact',
    });
    receipt = await submit(fixture, receipt);
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.equal(receipt.hold, null);
    assert.equal(fixture.state.submitted, 1);
  }
);

for (const [property, value, reason, state] of [
  ['error', 'generic-error', 'generic-error', 'provider-error'],
  ['error', 'validation-error', 'validation-error', 'provider-error'],
  ['dailyLimit', true, 'daily-limit', 'daily-limit'],
  ['external', true, 'external', 'external'],
]) {
  test(
    `dismissed ${reason} keeps automatic sending and deferral held`,
    { timeout: 3000 },
    async (t) => {
      const clock = { value: Date.UTC(2026, 10, 14) };
      const setup = await owned(t, { application: { now: () => clock.value } });
      const { fixture } = setup;
      let { receipt } = setup;
      if (reason === 'generic-error') {
        receipt = await fixture.service['application-mode'](
          identity(receipt, { paused: true })
        );
      }
      fixture.state.page[property] = value;
      receipt = await read(fixture, receipt);
      assert.equal(receipt.state, state);
      assert.equal(receipt.hold, reason);
      await assert.rejects(prefill(fixture, receipt), {
        code: 'jobs-application-state',
      });
      fixture.state.page[property] = property === 'error' ? null : false;
      receipt = await read(fixture, receipt);
      if (reason === 'daily-limit') {
        await assert.rejects(prefill(fixture, receipt), {
          code: 'jobs-application-limit-wait',
        });
        clock.value = Date.parse(receipt.applicationLimit.until);
        receipt = await read(fixture, receipt);
      }
      if (reason === 'generic-error') {
        receipt = await fixture.service['application-mode'](
          identity(receipt, { paused: false })
        );
      }
      receipt = await prefill(fixture, receipt);
      assert.equal(receipt.state, 'review');
      assert.equal(receipt.exact, true);
      assert.equal(fixture.state.submitted, 0);
      receipt = await fixture.service['application-mode'](
        identity(receipt, { noQuestionnaires: true })
      );
      assert.equal(
        receipt.active,
        true,
        'manual hold keeps actual native answers open'
      );
      assert.equal(receipt.hold, reason);
      assert.equal(
        (await fixture.service['application-queue']({})).entries.length,
        0
      );
      assert.equal(fixture.state.closed, 0);
    }
  );
}

test(
  'native holds survive close/reopen and failed journal writes, isolate slots and reset on worker restart',
  { timeout: 4000 },
  async (t) => {
    const fault = deferralStorageFault();
    const setup = await owned(t, { store: fault.store });
    const { fixture } = setup;
    let { receipt } = setup;
    fixture.state.page.error = 'validation-error';
    fault.state.stage = 'flush';
    fault.state.kind = 'draft';
    await assert.rejects(read(fixture, receipt), {
      code: 'fixture-deferral-save',
    });
    fixture.state.page.error = null;
    receipt = await read(fixture, receipt);
    assert.equal(receipt.hold, 'validation-error');
    await fixture.service['application-close'](identity(receipt));
    receipt = await fixture.service['application-status'](identity(receipt));
    assert.equal(receipt.hold, 'validation-error');
    receipt = await fixture.service['application-mode'](
      identity(receipt, { paused: true })
    );
    assert.equal(receipt.hold, 'validation-error');
    receipt = await fixture.service['application-open']({
      ...identity(receipt),
      recover: true,
    });
    assert.equal(receipt.hold, 'validation-error');
    receipt = await fixture.service['application-mode'](
      identity(receipt, { paused: false })
    );
    receipt = await prefill(fixture, receipt);
    assert.equal(fixture.state.submitted, 0);
    await fixture.service['application-close'](identity(receipt));
    const other = await fixture.service['application-open']({
      ...applicationInput,
      browserSlot: 'other-slot',
    });
    assert.equal(other.hold, null);
    await fixture.service['application-close'](identity(other));
    for (const row of await fixture.store.query()) {
      assert.equal(Object.hasOwn(row, 'hold'), false);
    }
    await fixture.service.stop();
    const restarted = createVacancyService(fixture.serviceOptions);
    t.after(() => restarted.stop());
    receipt = await restarted['application-open']({
      ...identity(receipt),
      recover: true,
    });
    assert.equal(receipt.hold, null);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a hold detected by the last native guard remains after dismissal without reserving dispatch',
  { timeout: 3000 },
  async (t) => {
    const setup = await owned(t);
    const { fixture } = setup;
    let { receipt } = setup;
    fixture.state.fields[1].value = 'Reviewed answer';
    receipt = await read(fixture, receipt);
    fixture.state.page.error = 'generic-error';
    await assert.rejects(submit(fixture, receipt), {
      code: 'jobs-application-changed',
    });
    fixture.state.page.error = null;
    receipt = await read(fixture, receipt);
    assert.equal(receipt.hold, 'generic-error');
    assert.equal(receipt.delivery, 'none');
    assert.equal(receipt.attempted.submit, false);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a native error during the exact-answer delay cancels automatic dispatch and retains its hold',
  { timeout: 3000 },
  async (t) => {
    const fixture = applicationFixture({
      application: {
        trace: (event) => {
          if (event.event === 'application-review-delay') {
            fixture.state.page.error = 'validation-error';
          }
        },
      },
    });
    t.after(() => fixture.close());
    let receipt = await fixture.enter(fixture.service, {
      autoExact: true,
      reviewDelayMs: 0,
    });
    receipt = await prefill(fixture, receipt);
    assert.equal(receipt.state, 'provider-error');
    fixture.state.page.error = null;
    receipt = await read(fixture, receipt);
    receipt = await prefill(fixture, receipt);
    assert.equal(receipt.hold, 'validation-error');
    assert.equal(receipt.attempted.submit, false);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'manual holds retain a native error page even without a visible form past idle cleanup',
  { timeout: 3000 },
  async (t) => {
    const setup = await owned(t, { application: { idleMs: 1 } });
    const { fixture } = setup;
    let { receipt } = setup;
    fixture.state.page.error = 'validation-error';
    fixture.state.page.scope = false;
    fixture.state.page.submit = null;
    receipt = await read(fixture, receipt);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(fixture.state.closed, 0);
    assert.equal(
      (await fixture.service['application-status'](identity(receipt))).active,
      true
    );
  }
);

test(
  'native error holds never erase an acknowledged uncertain submission',
  { timeout: 3000 },
  (t) => verifyUncertainHold(t, 'error', 'validation-error', 'provider-error')
);

test(
  'application receipts validate holds and error classes without rejecting legacy receipts',
  { timeout: 3000 },
  async (t) => {
    const { receipt } = await owned(t);
    for (const hold of [
      'generic-error',
      'validation-error',
      'verification',
      'daily-limit',
      'external',
      null,
    ]) {
      applicationResult({ ...receipt, hold }, applicationInput);
    }
    const legacy = { ...receipt };
    delete legacy.hold;
    applicationResult(legacy, applicationInput);
    for (const hold of [true, {}, 'review', '']) {
      assert.throws(() =>
        applicationResult({ ...receipt, hold }, applicationInput)
      );
    }
    assert.throws(() =>
      applicationResult(
        {
          ...receipt,
          page: { ...receipt.page, error: 'arbitrary-private-text' },
        },
        applicationInput
      )
    );
  }
);
