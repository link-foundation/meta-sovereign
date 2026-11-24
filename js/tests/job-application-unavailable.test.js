import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationState } from '../src/jobs/application-options.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { createVacancyService } from '../src/jobs/service.js';
import {
  applicationInput,
  applicationPageFixture,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';
import {
  ownHeldApplication,
  readHeldApplication,
  prefillHeldApplication,
  submitHeldApplication,
  verifyUncertainHold,
} from '../../experiments/issue-56/application-hold-fixture.mjs';

test('an explicit account-unavailable warning differs from missing controls and respects delivery boundaries', () => {
  const page = { ...applicationPageFixture(), vacancyUnavailable: true };
  assert.equal(applicationState(page), 'vacancy-unavailable');
  for (const [property, expected] of [
    ['challenge', 'verification'],
    ['dailyLimit', 'daily-limit'],
    ['delivered', 'delivered'],
  ]) {
    assert.equal(applicationState({ ...page, [property]: true }), expected);
  }
  assert.equal(applicationState({ bound: true }), 'unavailable');
  assert.equal(applicationState({ ...page, bound: false }), 'wrong-page');
});

test('an account-unavailable refusal retains answers, blocks actions and survives service restart until cleared', async (t) => {
  const { fixture, receipt: initial } = await ownHeldApplication(t);
  fixture.state.fields[1].value = 'Keep the private owner answer';
  fixture.state.page.vacancyUnavailable = true;
  let receipt = await readHeldApplication(fixture, initial);
  assert.equal(receipt.state, 'vacancy-unavailable');
  assert.equal(receipt.hold, 'vacancy-unavailable');
  applicationResult(receipt, applicationInput);
  const before = await fixture.service['skips-stored']({});
  assert.equal(before.entries[0].reason, 'vacancy_unavailable');
  await assert.rejects(prefillHeldApplication(fixture, receipt), {
    code: 'jobs-application-state',
  });
  await assert.rejects(submitHeldApplication(fixture, receipt), {
    code: 'jobs-application-state',
  });
  receipt = await fixture.service['application-mode'](
    applicationIdentity(receipt, { noQuestionnaires: true })
  );
  assert.equal(receipt.active, true);
  assert.equal(
    (await fixture.service['application-queue']({})).entries.length,
    0
  );
  assert.equal(fixture.state.fields[1].value, 'Keep the private owner answer');
  assert.equal(fixture.state.submitted, 0);
  await fixture.service['application-close'](applicationIdentity(receipt));
  const restarted = createVacancyService({
    store: fixture.store,
    openSession: async () =>
      assert.fail('A durable refusal must prevent opening'),
  });
  try {
    assert.deepEqual(await restarted['skips-stored']({}), before);
    await assert.rejects(restarted['application-open'](applicationInput), {
      code: 'jobs-application-skipped',
    });
    const cleared = await restarted['skip-clear']({
      revision: before.revision,
      reason: 'vacancy_unavailable',
    });
    assert.deepEqual(cleared.entries, []);
  } finally {
    await restarted.stop();
  }
});

test('an unavailable warning after dispatch cannot release uncertainty, even when its refusal is cleared', async (t) => {
  const { fixture, receipt } = await verifyUncertainHold(
    t,
    'vacancyUnavailable',
    true,
    'vacancy-unavailable'
  );
  const skips = await fixture.service['skips-stored']({});
  assert.equal(skips.entries[0].reason, 'vacancy_unavailable');
  await fixture.service['application-close'](applicationIdentity(receipt));
  await fixture.service['skip-clear']({
    revision: skips.revision,
    url: applicationInput.url,
  });
  const current = await fixture.service['application-status'](applicationInput);
  assert.equal(current.delivery, 'unknown');
  assert.equal(current.attempted.submit, true);
});

test('account-unavailable observations keep legacy receipts and reject nonboolean values', async (t) => {
  const { receipt } = await ownHeldApplication(t);
  for (const value of [undefined, false, true]) {
    applicationResult(
      { ...receipt, page: { ...receipt.page, vacancyUnavailable: value } },
      applicationInput
    );
  }
  for (const value of ['yes', null, 1, {}]) {
    assert.throws(() =>
      applicationResult(
        { ...receipt, page: { ...receipt.page, vacancyUnavailable: value } },
        applicationInput
      )
    );
  }
});
