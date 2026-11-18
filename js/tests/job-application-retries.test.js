import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationRetryFixture,
  dueRejectedApplication,
  queuedGenericApplication,
} from '../../experiments/issue-56/application-retry-fixture.mjs';
import {
  identity,
  deferralStorageFault,
} from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationRetryMs } from '../src/jobs/application-retries.js';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationQueueResult } from '../src/jobs/application-deferral-data.js';
import {
  assertUnapprovedApplicationLearning,
  assertApplicationAnswerObservation,
} from './helpers/application-deferral-assertions.mjs';

test(
  'generic-error full forms are backed and queued for five hours before closure',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationRetryFixture(t);
    const closed = await fixture.genericError(await fixture.answered());
    assert.equal(closed.state, 'closed');
    assert.equal(closed.active, false);
    assert.equal(closed.draft.fields[0].value, 'Owner recent storage work.');
    assert.equal(closed.draft.fields[1].value, 'Owner edited cover letter.');
    const queued = applicationQueueResult(await fixture.queue());
    assert.equal(queued.entries.length, 1);
    assert.equal(queued.entries[0].reason, 'generic-error');
    assert.equal(queued.entries[0].ready, false);
    assert.equal(
      Date.parse(queued.entries[0].retryAt) - fixture.clock.value,
      18000000
    );
    const rows = await fixture.store.query();
    assertApplicationAnswerObservation(rows, closed);
    const rejection = rows.find((row) =>
      row.id.startsWith('secret:jobs-application-rejection:')
    );
    assert.equal(rejection.draftId, closed.draft.id);
    assert.equal(rejection.reason, 'generic-error');
    await assertUnapprovedApplicationLearning(fixture);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(
      (await fixture.service['choices-stored']({})).entries.length,
      0
    );
    assert(
      rows.every(
        (row) => row.retryAt === undefined && row.queuedAt === undefined
      )
    );
  }
);

test(
  'generic-error exclusion and retry eligibility expire only at the five-hour boundary and isolate slots',
  { timeout: 4000 },
  async (t) => {
    const fixture = await queuedGenericApplication(t);
    const { entry } = fixture;
    const search = (input = {}) =>
      fixture.service.search({ query: 'Python', ...input });
    assert.equal((await search()).selection.decisions[0].reason, 'retry-wait');
    assert.equal(
      (await search({ browserSlot: 'other' })).selection.decisions[0].reason,
      'review'
    );
    await assert.rejects(
      fixture.service['application-open']({
        ...applicationInput,
        recover: true,
      }),
      { code: 'jobs-application-retry-wait' }
    );
    fixture.clock.value += applicationRetryMs - 1;
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-retry-wait',
    });
    assert.equal(fixture.state.opened, 1);
    fixture.clock.value++;
    assert.equal((await fixture.queue()).entries[0].ready, true);
    assert.equal((await search()).selection.decisions[0].reason, 'review');
    const receipt = await fixture.retry(entry);
    assert.equal(receipt.state, 'review');
    assert.equal(receipt.hold, null);
    assert.equal(receipt.draft.fields[1].value, 'Owner edited cover letter.');
    assert.deepEqual(
      fixture.state.fields.slice(1).map((row) => row.value),
      ['', '']
    );
    assert.equal(fixture.state.writes.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a fresh native generic rejection preserves failed dispatch history and admits one separately confirmed retry',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationRetryFixture(t);
    const answered = await fixture.answered();
    fixture.state.rejectSubmission = 'generic-error';
    const closed = await fixture.service['application-advance'](
      identity(answered, { action: 'submit', confirm: true })
    );
    assert.equal(closed.state, 'closed');
    assert.equal(closed.delivery, 'unknown');
    assert.equal(closed.attempted.submit, true);
    const [entry] = (await fixture.queue()).entries;
    fixture.clock.value += applicationRetryMs;
    fixture.state.rejectSubmission = null;
    let review = await fixture.retry(entry);
    assert.equal(review.attempted.submit, false);
    assert.equal(review.delivery, 'none');
    const rejections = (await fixture.store.query()).filter((row) =>
      row.id.startsWith('secret:jobs-application-rejection:')
    );
    assert.equal(rejections.length, 1);
    assert.equal(rejections[0].attempted.submit, true);
    assert.equal(rejections[0].delivery, 'unknown');
    review = await fixture.service['application-restore'](
      identity(review, { confirm: true })
    );
    assert.equal(review.restoration.applied, 2);
    assert.equal(
      fixture.state.submitted,
      1,
      'restoration never retries a send'
    );
    review = await fixture.service['application-advance'](
      identity(review, { action: 'submit', confirm: true })
    );
    assert.equal(review.delivery, 'provider-confirmed');
    assert.equal(fixture.state.submitted, 2);
    await assert.rejects(
      fixture.service['application-advance'](
        identity(review, { action: 'submit', confirm: true })
      ),
      { code: 'jobs-application-already-attempted' }
    );
  }
);

for (const stage of ['put', 'flush']) {
  for (const kind of ['draft', 'answers', 'learning', 'rejection']) {
    test(
      `generic-error ${kind} ${stage} failure leaves the live owner form and no queue`,
      { timeout: 5000 },
      async (t) => {
        const fault = deferralStorageFault();
        const fixture = applicationRetryFixture(t, { store: fault.store });
        const answered = await fixture.answered();
        Object.assign(fault.state, {
          stage,
          kind,
          when: (row) => kind !== 'draft' || Boolean(row.draft),
        });
        await assert.rejects(fixture.genericError(answered), {
          code: 'fixture-deferral-save',
        });
        assert.equal(fault.state.hits, 1);
        assert.equal(fixture.state.closed, 0);
        assert.equal(
          fixture.state.fields[1].value,
          'Owner recent storage work.'
        );
        assert.equal((await fixture.queue()).entries.length, 0);
        assert.equal(
          (await fixture.service['application-status'](applicationInput))
            .active,
          true
        );
        const current =
          await fixture.service['application-status'](applicationInput);
        const retried = await fixture.service['application-read'](
          identity(current)
        );
        assert.equal(retried.state, 'closed');
      }
    );
  }
}

test(
  'restarting forgets the retry exclusion while retaining private drafts and failed reservations',
  { timeout: 4000 },
  async (t) => {
    const fixture = await queuedGenericApplication(t);
    await fixture.service.stop();
    const restarted = createVacancyService(fixture.serviceOptions);
    t.after(() => restarted.stop());
    assert.equal((await restarted['application-queue']({})).entries.length, 0);
    assert.equal(
      (await restarted.search({ query: 'Python' })).selection.decisions[0]
        .reason,
      'review'
    );
    const reopened = await restarted['application-open']({
      ...applicationInput,
      recover: true,
    });
    assert.equal(reopened.state, 'review');
    assert.equal(reopened.draft.fields[0].value, 'Owner recent storage work.');
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'an unknown dispatch without a native generic rejection never enters the timed queue',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationRetryFixture(t);
    const answered = await fixture.answered();
    fixture.state.unknownSubmission = true;
    await assert.rejects(
      fixture.service['application-advance'](
        identity(answered, { action: 'submit', confirm: true })
      ),
      { code: 'fixture-lost-send' }
    );
    const receipt =
      await fixture.service['application-status'](applicationInput);
    assert.equal(receipt.delivery, 'unknown');
    fixture.clock.value += 2 * applicationRetryMs;
    const fresh = await fixture.service['application-read'](identity(receipt));
    assert.equal(fresh.attempted.submit, true);
    assert.equal((await fixture.queue()).entries.length, 0);
    await assert.rejects(
      fixture.service['application-advance'](
        identity(fresh, { action: 'submit', confirm: true })
      ),
      { code: 'jobs-application-already-attempted' }
    );
    assert.equal(fixture.state.submitted, 1);
  }
);

for (const alteration of [
  'owner-edit',
  'verification',
  'mode-change',
  'incomplete',
]) {
  test(
    `a late ${alteration} refuses generic retry closure`,
    { timeout: 4000 },
    async (t) => {
      const fault = deferralStorageFault();
      const fixture = applicationRetryFixture(t, { store: fault.store });
      const answered = await fixture.answered();
      if (alteration === 'incomplete') {
        fixture.hooks.report = (report) => ({
          ...report,
          omissions: ['a native field was not inspected'],
        });
      } else {
        fault.state.hook = (row) => {
          if (!row.id.startsWith('secret:jobs-application-answers:')) {
            return;
          }
          fault.state.hook = null;
          if (alteration === 'owner-edit') {
            fixture.state.fields[1].value = 'Late owner correction';
          }
          if (alteration === 'verification') {
            fixture.state.page.challenge = true;
          }
          if (alteration === 'mode-change') {
            fixture.service['application-signal-mode']({
              noQuestionnaires: true,
            });
          }
        };
      }
      await assert.rejects(fixture.genericError(answered));
      assert.equal((await fixture.queue()).entries.length, 0);
      assert.equal(fixture.state.closed, 0);
      assert.equal(fixture.state.submitted, 0);
    }
  );
}

test(
  'separately saved exclusions outrank a due RAM retry',
  { timeout: 4000 },
  async (t) => {
    const fixture = await queuedGenericApplication(t);
    const { entry } = fixture;
    await fixture.service['choice-save']({
      ...applicationInput,
      title: 'Owner excluded vacancy',
      state: 'skipped',
      note: 'Owner exclusion',
      revision: 'empty',
    });
    fixture.clock.value += applicationRetryMs;
    assert.equal(
      (await fixture.service.search({ query: 'Python' })).selection.decisions[0]
        .reason,
      'owner-skipped'
    );
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-excluded',
    });
    assert.equal((await fixture.queue()).entries.length, 1);
    assert.equal(fixture.state.opened, 1);
  }
);

test(
  'a paused generic-error form stays live until the owner resumes preservation',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationRetryFixture(t);
    let receipt = await fixture.answered();
    receipt = await fixture.service['application-mode'](
      identity(receipt, { paused: true })
    );
    receipt = await fixture.genericError(receipt);
    assert.equal(receipt.active, true);
    assert.equal((await fixture.queue()).entries.length, 0);
    receipt = await fixture.service['application-mode'](
      identity(receipt, { paused: false })
    );
    assert.equal(receipt.state, 'closed');
    assert.equal((await fixture.queue()).entries[0].ready, false);
  }
);

test(
  'a failed due reopening retains the queue and acknowledged rejection for a later fresh review',
  { timeout: 4000 },
  async (t) => {
    let failOpen = false;
    const fixture = await dueRejectedApplication(t, {
      application: {
        trace: (event) => {
          if (failOpen && event.event === 'application-opening-location') {
            failOpen = false;
            throw Object.assign(new Error('Finite retry browser failure'), {
              code: 'fixture-retry-open',
            });
          }
        },
      },
    });
    const { entry } = fixture;
    failOpen = true;
    await assert.rejects(fixture.retry(entry), { code: 'fixture-retry-open' });
    assert.equal((await fixture.queue()).entries.length, 1);
    const receipt = await fixture.retry(entry);
    assert.equal(receipt.state, 'review');
    assert.equal(receipt.attempted.submit, false);
    assert.equal(fixture.state.submitted, 1);
  }
);

test(
  'zero-effect preview never closes or queues a visible generic error',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationRetryFixture(t);
    const opened = await fixture.service['application-open']({
      ...applicationInput,
      testMode: true,
    });
    fixture.state.page.enter = null;
    fixture.state.page.submit = {
      qa: 'vacancy-response-submit-popup',
      disabled: false,
    };
    fixture.state.page.scope = true;
    fixture.state.page.questions = true;
    fixture.state.fields[1].value = 'Owner preview value';
    const receipt = await fixture.genericError(opened);
    assert.equal(receipt.testMode, true);
    assert.equal(receipt.active, true);
    assert.equal((await fixture.queue()).entries.length, 0);
    assert.equal(fixture.state.closed, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'confirmed delivery during an ordinary due review removes its old generic retry entry',
  { timeout: 4000 },
  async (t) => {
    const fixture = await queuedGenericApplication(t);
    fixture.clock.value += applicationRetryMs;
    let receipt = await fixture.service['application-open']({
      ...applicationInput,
      recover: true,
    });
    assert.equal(receipt.hold, 'generic-error');
    receipt = await fixture.service['application-restore'](
      identity(receipt, { confirm: true })
    );
    receipt = await fixture.service['application-advance'](
      identity(receipt, { action: 'submit', confirm: true })
    );
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.equal(receipt.hold, null);
    assert.equal((await fixture.queue()).entries.length, 0);
    assert.equal(fixture.state.submitted, 1);
  }
);

for (const stage of ['put', 'flush']) {
  test(
    `a failed ${stage} of the due reservation release keeps the original failed send and queue`,
    { timeout: 4000 },
    async (t) => {
      const fault = deferralStorageFault();
      const fixture = await dueRejectedApplication(t, { store: fault.store });
      const { entry } = fixture;
      Object.assign(fault.state, { kind: 'draft', stage });
      await assert.rejects(fixture.retry(entry), {
        code: 'fixture-deferral-save',
      });
      const retained =
        await fixture.service['application-status'](applicationInput);
      assert.equal(retained.attempted.submit, true);
      assert.equal(retained.delivery, 'unknown');
      assert.equal((await fixture.queue()).entries.length, 1);
      assert.equal(fixture.state.opened, 1);
      const fresh = await fixture.retry(entry);
      assert.equal(fresh.attempted.submit, false);
      assert.equal(fixture.state.submitted, 1);
    }
  );
}

test(
  'a missing or altered rejection receipt cannot release a dispatch reservation',
  { timeout: 4000 },
  async (t) => {
    const fixture = await dueRejectedApplication(t);
    const { entry } = fixture;
    const rejection = (await fixture.store.query()).find((row) =>
      row.id.startsWith('secret:jobs-application-rejection:')
    );
    await fixture.store.put({ ...rejection, draftId: 'altered' });
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-state',
    });
    await fixture.store.delete(rejection.id);
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-state',
    });
    const status =
      await fixture.service['application-status'](applicationInput);
    assert.equal(status.attempted.submit, true);
    assert.equal(status.delivery, 'unknown');
    await fixture.store.put(globalThis.structuredClone(rejection));
    const shared = await fixture.store.get(rejection.id);
    shared.attempted.submit = false;
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-state',
    });
    await fixture.store.put(
      Object.fromEntries(Object.entries(rejection).reverse())
    );
    const reviewed = await fixture.retry(entry);
    assert.equal(
      reviewed.attempted.submit,
      false,
      'record key ordering does not invalidate the evidence'
    );
  }
);
