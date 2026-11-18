import test from 'node:test';
import assert from 'node:assert/strict';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationKey } from '../src/jobs/application-options.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationRecoveryFixture } from '../../experiments/issue-56/application-recovery-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { createMemoryStore } from '../src/storage/universal.js';

const setup = (t, options) => {
  const fixture = applicationRecoveryFixture({ popup: true, ...options });
  t.after(() => fixture.close());
  return fixture;
};
const reopen = async (t, fixture) => {
  await fixture.service.stop();
  const service = createVacancyService(fixture.serviceOptions);
  t.after(() => service.stop());
  const receipt = await service['application-open']({
    ...applicationInput,
    recover: true,
  });
  return { service, receipt };
};
const reenter = (service, receipt, extra) =>
  service['application-advance'](
    identity(receipt, { action: 'reenter', confirm: true, ...extra })
  );
const assertEntryBlocked = (service, receipt) =>
  assert.rejects(reenter(service, receipt), {
    code: 'jobs-application-already-attempted',
  });

test(
  'acknowledged popup recovery requires new entry confirmation and preserves original reservations',
  { timeout: 4000 },
  async (t) => {
    const fixture = setup(t);
    await fixture.enter();
    const { service, receipt } = await reopen(t, fixture);
    assert.equal(receipt.state, 'ready');
    assert.equal(receipt.reentryAvailable, true);
    assert.equal(receipt.attempted.enter, true);
    assert.equal(fixture.state.entered, 1);
    await assert.rejects(
      service['application-advance'](
        identity(receipt, { action: 'enter', confirm: true })
      ),
      { code: 'jobs-application-already-attempted' }
    );
    await assert.rejects(reenter(service, receipt, { confirm: false }), {
      code: 'jobs-application-confirmation',
    });
    await assert.rejects(reenter(service, receipt, { revision: 'stale' }), {
      code: 'jobs-application-changed',
    });
    await assert.rejects(reenter(service, receipt, { automatic: true }), {
      code: 'jobs-application-exact',
    });
    let review = await reenter(service, receipt);
    assert.equal(review.state, 'review');
    assert.equal(review.delivery, 'none');
    assert.equal(fixture.state.entered, 2);
    assert.equal(fixture.state.writes.length, 0);
    review = await service['application-advance'](
      identity(review, { action: 'submit', confirm: true })
    );
    assert.equal(review.delivery, 'provider-confirmed');
    assert.equal(fixture.state.submitted, 1);
  }
);

for (const stage of ['put', 'flush']) {
  test(
    `failed popup checkpoint ${stage} keeps uncertain entry reserved`,
    { timeout: 4000 },
    async (t) => {
      const memory = createMemoryStore();
      let armed = true;
      let popupWrite = false;
      const refuse = () => {
        if (armed && popupWrite) {
          armed = false;
          throw Object.assign(new Error('Popup checkpoint refused'), {
            code: 'fixture-storage',
          });
        }
      };
      const fixture = setup(t, {
        store: {
          ...memory,
          put: async (row) => {
            await memory.put(row);
            popupWrite = row.popupReview === true;
            if (stage === 'put') {
              refuse();
            }
          },
          flush: stage === 'flush' ? refuse : undefined,
        },
      });
      await assert.rejects(fixture.enter(), { code: 'fixture-storage' });
      const { service, receipt } = await reopen(t, fixture);
      assert.equal(receipt.reentryAvailable, false);
      assert.equal(receipt.delivery, 'unknown');
      await assertEntryBlocked(service, receipt);
      assert.equal(fixture.state.entered, 1);
    }
  );
}

test(
  'lost re-entry reply consumes its checkpoint before dispatch and survives restart',
  { timeout: 4000 },
  async (t) => {
    const fixture = setup(t);
    await fixture.enter();
    const original = fixture.serviceOptions.application.dispatch;
    fixture.serviceOptions.application.dispatch = async (...args) => {
      assert.equal(
        (await fixture.store.get(applicationKey(applicationInput).id))
          .popupReview,
        false
      );
      await original(...args);
      throw new Error('Lost native entry result');
    };
    const first = await reopen(t, fixture);
    await assert.rejects(reenter(first.service, first.receipt), /Lost native/);
    await first.service.stop();
    const { service, receipt } = await reopen(t, fixture);
    assert.equal(receipt.reentryAvailable, false);
    assert.equal(receipt.delivery, 'unknown');
    await assertEntryBlocked(service, receipt);
    assert.equal(fixture.state.entered, 2);
  }
);

test(
  'unknown submission and legacy popup journals cannot authorize another entry',
  { timeout: 4000 },
  async (t) => {
    const fixture = setup(t);
    const dispatch = fixture.serviceOptions.application.dispatch;
    fixture.serviceOptions.application.dispatch = async (...args) => {
      if (args[2] === 'submit') {
        throw new Error('Unknown send');
      }
      return dispatch(...args);
    };
    fixture.service = createVacancyService(fixture.serviceOptions);
    const review = await fixture.enter();
    await assert.rejects(
      fixture.service['application-advance'](
        identity(review, { action: 'submit', confirm: true })
      ),
      /Unknown send/
    );
    const { service, receipt } = await reopen(t, fixture);
    assert.equal(receipt.reentryAvailable, false);
    assert.equal(receipt.attempted.submit, true);
    await assertEntryBlocked(service, receipt);
    await service.stop();
    const row = await fixture.store.get(applicationKey(applicationInput).id);
    delete row.popupReview;
    await fixture.store.put(row);
    const legacy = await reopen(t, fixture);
    assert.equal(legacy.receipt.reentryAvailable, false);
    await assertEntryBlocked(legacy.service, legacy.receipt);
  }
);

test(
  'popup re-entry respects pauses and changed native pages',
  { timeout: 4000 },
  async (t) => {
    const fixture = setup(t);
    await fixture.enter();
    const { service, receipt } = await reopen(t, fixture);
    const paused = await service['application-mode'](
      identity(receipt, { paused: true })
    );
    assert.equal(paused.reentryAvailable, false);
    await assertEntryBlocked(service, paused);
    const resumed = await service['application-mode'](
      identity(paused, { paused: false })
    );
    fixture.state.page.documentKey = 'changed-document';
    await assert.rejects(reenter(service, resumed), {
      code: 'jobs-application-changed',
    });
    assert.equal(fixture.state.entered, 1);
    for (const reentryAvailable of [null, 'true', {}, true]) {
      assert.throws(
        () =>
          applicationResult(
            { ...receipt, active: false, reentryAvailable },
            applicationInput
          ),
        { code: 'jobs-application-unconfirmed' }
      );
    }
  }
);

test(
  'popup preview never clicks or offers a writable recovery receipt',
  { timeout: 4000 },
  async (t) => {
    const fixture = setup(t);
    await fixture.enter();
    await fixture.service.stop();
    const row = await fixture.store.get(applicationKey(applicationInput).id);
    row.options.testMode = true;
    row.signature = JSON.stringify(row.options);
    await fixture.store.put(row);
    const { service, receipt } = await reopen(t, fixture);
    assert.equal(receipt.reentryAvailable, true);
    const preview = await reenter(service, receipt);
    assert.equal(preview.state, 'test-preview');
    assert.equal(preview.reentryAvailable, false);
    applicationResult(preview, applicationInput);
    assert.equal(fixture.state.entered, 1);
  }
);

test(
  'held popup and failed re-entry reservation cannot release original entry',
  { timeout: 4000 },
  async (t) => {
    const memory = createMemoryStore();
    let armed = false;
    const fixture = setup(t, {
      store: {
        ...memory,
        put: async (row) => {
          if (armed && row.state === 'sending') {
            armed = false;
            throw Object.assign(new Error('Dispatch reservation refused'), {
              code: 'fixture-storage',
            });
          }
          await memory.put(row);
        },
      },
    });
    await fixture.enter();
    const { service, receipt } = await reopen(t, fixture);
    armed = true;
    await assert.rejects(reenter(service, receipt), {
      code: 'fixture-storage',
    });
    assert.equal(fixture.state.entered, 1);
    assert.equal(
      (await memory.get(applicationKey(applicationInput).id)).popupReview,
      true
    );
    fixture.state.page.error = 'validation-error';
    let held = await service['application-read'](
      identity(await service['application-status'](applicationInput))
    );
    assert.equal(held.hold, 'validation-error');
    fixture.state.page.error = null;
    held = await service['application-read'](identity(held));
    assert.equal(held.reentryAvailable, false);
    await assertEntryBlocked(service, held);
    assert.equal(fixture.state.entered, 1);
  }
);

test(
  'explicit re-entry may immediately confirm delivery instead of reopening a popup',
  { timeout: 4000 },
  async (t) => {
    const fixture = setup(t);
    await fixture.enter();
    const original = fixture.serviceOptions.application.dispatch;
    fixture.serviceOptions.application.dispatch = async (...args) => {
      const value = await original(...args);
      Object.assign(fixture.state.page, {
        delivered: true,
        submit: null,
        scope: false,
      });
      return value;
    };
    const { service, receipt } = await reopen(t, fixture);
    const delivered = await reenter(service, receipt);
    assert.equal(delivered.delivery, 'provider-confirmed');
    assert.equal(delivered.reentryAvailable, false);
    await assertEntryBlocked(service, delivered);
    assert.equal(fixture.state.entered, 2);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'popup checkpoint rejects contradictory saved intent before launching another browser',
  { timeout: 4000 },
  async (t) => {
    const fixture = setup(t);
    await fixture.enter();
    await fixture.service.stop();
    const original = await fixture.store.get(
      applicationKey(applicationInput).id
    );
    for (const change of [
      { popupReview: 'true' },
      { popupReview: {} },
      { attempted: { enter: false, submit: false } },
      { attempted: { enter: true, submit: true } },
      { attempted: null },
      { delivery: 'unknown' },
      { delivery: 'provider-confirmed' },
      { vacancy: null },
      { resumeUrl: 'https://hh.ru/applicant/vacancy_response?vacancyId=123' },
    ]) {
      await fixture.store.put({ ...original, ...change });
      const service = createVacancyService(fixture.serviceOptions);
      try {
        await assert.rejects(
          service['application-open']({ ...applicationInput, recover: true }),
          { code: 'jobs-application-journal' }
        );
        assert.equal(fixture.state.opened, 1);
      } finally {
        await service.stop();
      }
    }
  }
);

test(
  'definitive native refusal retains popup review while a later full-form navigation replaces it',
  { timeout: 4000 },
  async (t) => {
    const fixture = setup(t);
    await fixture.enter();
    fixture.serviceOptions.application.dispatch = async () => ({
      dispatched: false,
    });
    const { service, receipt } = await reopen(t, fixture);
    const refused = await reenter(service, receipt);
    assert.equal(refused.reentryAvailable, true);
    assert.equal(refused.attempted.enter, true);
    assert.equal(fixture.state.entered, 1);
    Object.assign(fixture.state.page, {
      url: 'https://hh.ru/applicant/vacancy_response?vacancyId=123',
      enter: null,
      submit: { qa: 'vacancy-response-letter-submit', disabled: false },
      scope: true,
    });
    const form = await service['application-read'](identity(refused));
    assert.equal(form.state, 'review');
    await service.stop();
    const full = await reopen(t, fixture);
    assert.equal(full.receipt.state, 'review');
    assert.equal(full.receipt.reentryAvailable, false);
    assert.equal(fixture.state.entered, 1);
  }
);
