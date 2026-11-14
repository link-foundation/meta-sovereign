import { assertUnapprovedApplicationLearning } from './helpers/application-deferral-assertions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationDeferralFixture,
  deferralStorageFault,
  ownedDeferralFixture,
  answeredDeferralTest,
  identity,
} from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

const mode = (fixture, receipt, values) =>
  fixture.service['application-mode'](identity(receipt, values));
const signal = (fixture, noQuestionnaires, extra = {}) =>
  fixture.service['application-signal-mode']({
    ...applicationInput,
    noQuestionnaires,
    ...extra,
  });
const status = (fixture) =>
  fixture.service['application-status'](applicationInput);

test(
  'enabling questionnaire deferral automatically preserves actual values, closes and queues before a separate confirmed review',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    const receipt = await fixture.answered();
    const closed = await mode(fixture, receipt, { noQuestionnaires: true });
    assert.equal(
      closed.state,
      'closed',
      'the enabled policy must leave the questionnaire automatically'
    );
    assert.equal(closed.active, false);
    assert.equal(closed.noQuestionnaires, true);
    assert.deepEqual(
      closed.draft.fields.map((field) => field.value),
      ['Owner recent storage work.', 'Owner edited cover letter.']
    );
    const [entry] = (await fixture.queue()).entries;
    assert(entry);
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-questionnaires-held',
    });
    assert.equal(fixture.state.opened, 1);
    for (const values of [{ revision: 'stale' }, { requestId: 'foreign' }]) {
      await assert.rejects(
        mode(fixture, { ...closed, ...values }, { noQuestionnaires: false }),
        { code: 'jobs-application-changed' }
      );
    }
    const enabled = await mode(fixture, closed, { noQuestionnaires: false });
    assert.equal(enabled.active, false);
    assert.equal(enabled.noQuestionnaires, false);
    assert.equal(
      fixture.state.opened,
      1,
      'a policy change cannot reopen a native browser'
    );
    const reopened = await fixture.retry(entry);
    assert.equal(reopened.state, 'review');
    assert.equal(reopened.attempted.submit, false);
    assert.deepEqual(
      fixture.state.fields.slice(1).map((field) => field.value),
      ['', '']
    );
    assert.equal(fixture.state.writes.length, 0);
    assert.equal(fixture.state.submitted, 0);
    assert.equal((await fixture.queue()).entries.length, 0);
    await assertUnapprovedApplicationLearning(fixture);
  }
);

test(
  'an idle foreground signal takes a fresh actual inspection before automatically leaving; foreign slots do not touch this browser',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    await fixture.answered();
    signal(fixture, true, { browserSlot: 'other' });
    assert.equal((await status(fixture)).active, true);
    fixture.state.fields[1].value = 'Owner edit since the last read';
    signal(fixture, true);
    const saved = await status(fixture);
    assert.equal(saved.active, false);
    assert.equal(saved.draft.fields[0].value, 'Owner edit since the last read');
    assert.equal((await fixture.queue()).entries.length, 1);
    assert.equal(fixture.state.closed, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);

for (const kind of ['answers', 'learning']) {
  test(
    `failed automatic ${kind} checkpoint leaves actual answers open and does not queue`,
    { timeout: 4000 },
    async (t) => {
      const { fault, fixture, receipt } = await answeredDeferralTest(t);
      Object.assign(fault.state, { stage: 'flush', kind });
      await assert.rejects(mode(fixture, receipt, { noQuestionnaires: true }), {
        code: 'fixture-deferral-save',
      });
      const held = await status(fixture);
      assert.equal(held.active, true);
      assert.equal(held.noQuestionnaires, true);
      assert.equal(fixture.state.fields[1].value, 'Owner recent storage work.');
      assert.equal(fixture.state.closed, 0);
      assert.equal((await fixture.queue()).entries.length, 0);
      const closed = await fixture.service['application-read'](identity(held));
      assert.equal(closed.state, 'closed');
      assert.equal((await fixture.queue()).entries.length, 1);
      assert.equal(fixture.state.submitted, 0);
    }
  );
}

test(
  'a failed explicit save cannot automatically replay when a foreground signal enables deferral during the checkpoint',
  { timeout: 4000 },
  async (t) => {
    const { fault, fixture, receipt } = await answeredDeferralTest(t);
    Object.assign(fault.state, { stage: 'flush', kind: 'answers' });
    fault.state.hook = (row) => {
      if (row.id.startsWith('secret:jobs-application-answers:')) {
        fault.state.hook = null;
        signal(fixture, true);
      }
    };
    await assert.rejects(fixture.defer(receipt), {
      code: 'fixture-deferral-save',
    });
    const held = await status(fixture);
    assert.equal(held.active, true);
    assert.equal(held.noQuestionnaires, true);
    assert.equal(fault.state.hits, 1);
    assert.equal(fixture.state.closed, 0);
    assert.equal((await fixture.queue()).entries.length, 0);
    const closed = await fixture.service['application-read'](identity(held));
    assert.equal(closed.active, false);
    assert.equal((await fixture.queue()).entries.length, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  're-enabling questions during an acknowledged private save cancels automatic closure and retains the latest worker mode',
  { timeout: 4000 },
  async (t) => {
    const { fault, fixture, receipt } = await answeredDeferralTest(t);
    const held = gate();
    const started = gate();
    fault.state.hook = async (row) => {
      if (row.id.startsWith('secret:jobs-application-answers:')) {
        fault.state.hook = null;
        started.resolve();
        await held.promise;
      }
    };
    const changing = mode(fixture, receipt, { noQuestionnaires: true });
    try {
      await started.promise;
      signal(fixture, false);
    } finally {
      held.resolve();
    }
    const retained = await changing;
    assert.equal(retained.active, true);
    assert.equal(retained.noQuestionnaires, false);
    assert.equal(retained.state, 'review');
    assert.equal(fixture.state.closed, 0);
    assert.equal((await fixture.queue()).entries.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'pause and zero-effect preview prevent automatic closing, and releasing pause applies the retained questionnaire policy',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    let receipt = await fixture.answered();
    receipt = await mode(fixture, receipt, {
      paused: true,
      noQuestionnaires: true,
    });
    assert.equal(receipt.active, true);
    assert.equal(receipt.state, 'paused');
    assert.equal((await fixture.queue()).entries.length, 0);
    receipt = await mode(fixture, receipt, { paused: false });
    assert.equal(receipt.state, 'closed');
    const preview = ownedDeferralFixture(t);
    const ready = await preview.service['application-open']({
      ...applicationInput,
      testMode: true,
    });
    preview.state.page.enter = null;
    preview.state.page.submit = {
      qa: 'vacancy-response-submit-popup',
      disabled: false,
    };
    preview.state.page.scope = true;
    preview.state.page.questions = true;
    preview.state.fields[1].value = 'Owner preview answer';
    const read = await preview.service['application-read'](identity(ready));
    const held = await mode(preview, read, { noQuestionnaires: true });
    assert.equal(held.active, true);
    assert.equal(held.testMode, true);
    assert.equal((await preview.queue()).entries.length, 0);
    assert.equal(preview.state.closed, 0);
    assert.equal(preview.state.submitted, 0);
  }
);

test(
  'failed inactive mode acknowledgement keeps the worker policy and queue; a fresh retry can enable review',
  { timeout: 4000 },
  async (t) => {
    const fault = deferralStorageFault();
    const fixture = applicationDeferralFixture({ store: fault.store });
    t.after(() => fixture.close());
    const closed = await mode(fixture, await fixture.answered(), {
      noQuestionnaires: true,
    });
    Object.assign(fault.state, { stage: 'flush', kind: 'draft' });
    await assert.rejects(mode(fixture, closed, { noQuestionnaires: false }), {
      code: 'fixture-deferral-save',
    });
    const retained = await status(fixture);
    assert.equal(retained.noQuestionnaires, true);
    assert.equal(retained.active, false);
    const [entry] = (await fixture.queue()).entries;
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-questionnaires-held',
    });
    await mode(fixture, retained, { noQuestionnaires: false });
    assert.equal((await fixture.retry(entry)).state, 'review');
    assert.equal(fixture.state.submitted, 0);
  }
);
