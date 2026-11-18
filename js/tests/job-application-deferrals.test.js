import {
  assertUnapprovedApplicationLearning,
  assertApplicationAnswerObservation,
} from './helpers/application-deferral-assertions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createVacancyService } from '../src/jobs/service.js';
import {
  listAnswerRules,
  saveAnswerRule,
} from '../src/automation/question-store.js';
import { applicationQueueResult } from '../src/jobs/application-deferral-data.js';
import { formModelField } from './helpers/forms-plan-inspection.mjs';
import {
  applicationDeferralFixture,
  deferralStorageFault,
  ownedDeferralFixture,
  answeredDeferralTest,
  identity,
} from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';

test(
  'confirmed deferral acknowledges actual private answers and unapproved knowledge before closing; retry only reopens a fresh review',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    const answered = await fixture.answered();
    const closed = await fixture.defer(answered);
    assert.equal(closed.state, 'closed');
    assert.equal(closed.active, false);
    assert.equal(fixture.state.closed, 1);
    const queue = applicationQueueResult(await fixture.queue());
    assert.equal(queue.entries.length, 1);
    assert.equal(queue.entries[0].reason, 'questionnaire');
    const rows = await fixture.store.query();
    const observation = assertApplicationAnswerObservation(rows, closed);
    assert.deepEqual(
      observation.pairs.map((row) => row.text),
      observation.fields.map((row) => row.value)
    );
    assert(!JSON.stringify(queue).includes('Owner recent storage work.'));
    const knowledge = await listAnswerRules(fixture.store);
    assert(
      knowledge.some((rule) =>
        rule.answers.some((row) => row.text === 'Owner recent storage work.')
      )
    );
    assert(
      knowledge.every((rule) =>
        rule.answers.every((row) => !row.approved && !row.canonical)
      )
    );
    assert(
      rows.every(
        (row) => row.reason === undefined && row.queuedAt === undefined
      )
    );
    let receipt = await fixture.retry(queue.entries[0]);
    assert.equal(receipt.state, 'review');
    assert.equal(receipt.draft.id, closed.draft.id);
    assert.equal((await fixture.queue()).entries.length, 0);
    assert.deepEqual(
      fixture.state.fields.slice(1).map((row) => row.value),
      ['', '']
    );
    assert.equal(fixture.state.writes.length, 0);
    await assert.rejects(fixture.retry(queue.entries[0]), {
      code: 'jobs-application-queue',
    });
    receipt = await fixture.service['application-restore'](
      identity(receipt, { confirm: true })
    );
    assert.equal(receipt.restoration.applied, 2);
    assert.equal(fixture.state.entered, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);

for (const stage of ['put', 'flush']) {
  for (const kind of ['draft', 'answers', 'learning']) {
    test(
      `failed ${kind} ${stage} keeps the questionnaire open past idle and does not queue or send`,
      { timeout: 4000 },
      async (t) => {
        const { fault, fixture, receipt } = await answeredDeferralTest(t, {
          idleMs: 5,
        });
        Object.assign(fault.state, { stage, kind });
        await assert.rejects(fixture.defer(receipt), {
          code: 'fixture-deferral-save',
        });
        await wait(30);
        assert.equal(fault.state.hits, 1);
        assert.equal((await fixture.queue()).entries.length, 0);
        const status =
          await fixture.service['application-status'](applicationInput);
        assert.equal(status.active, true);
        assert.equal(fixture.state.closed, 0);
        assert.equal(
          fixture.state.fields[1].value,
          'Owner recent storage work.'
        );
        assert.equal(fixture.state.submitted, 0);
        const fresh = await fixture.service['application-read'](
          identity(status)
        );
        await fixture.defer(fresh);
        assert.equal((await fixture.queue()).entries.length, 1);
        assert.equal(fixture.state.closed, 1);
        await assertUnapprovedApplicationLearning(fixture);
      }
    );
  }
}

test(
  'a late owner edit during the Q&A checkpoint preserves the live form and refuses queue admission',
  { timeout: 4000 },
  async (t) => {
    const { fault, fixture, receipt } = await answeredDeferralTest(t);
    fault.state.hook = (row) => {
      if (row.id.startsWith('secret:jobs-application-answers:')) {
        fault.state.hook = null;
        fixture.state.fields[1].value = 'Late actual owner edit';
      }
    };
    await assert.rejects(fixture.defer(receipt), {
      code: 'jobs-application-changed',
    });
    assert.equal((await fixture.queue()).entries.length, 0);
    assert.equal(fixture.state.closed, 0);
    assert.equal(fixture.state.fields[1].value, 'Late actual owner edit');
    assert.equal((await listAnswerRules(fixture.store)).length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'native choice values and policy-excluded answers remain private recovery evidence',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    let receipt = await fixture.answered();
    fixture.state.fields[1].label = 'Salary expectations';
    fixture.state.fields[1].value = '100000';
    fixture.state.fields.push(
      formModelField('Consent', {
        tag: 'input',
        type: 'checkbox',
        index: 3,
        value: 'yes',
        checked: true,
      })
    );
    receipt = await fixture.service['application-read'](identity(receipt));
    const closed = await fixture.defer(receipt);
    assert.equal(closed.draft.fields[2].checked, true);
    const observations = (await fixture.store.query()).find((row) =>
      row.id.startsWith('secret:jobs-application-answers:')
    );
    assert.deepEqual(
      observations.pairs.map((row) => row.text),
      ['100000', 'Owner edited cover letter.', 'Yes']
    );
    assert(
      !(await listAnswerRules(fixture.store)).some(
        (rule) => rule.question === 'Salary expectations'
      )
    );
  }
);

test(
  'fresh ownership, confirmation and complete safe questionnaires are required; unsupported captures do not leave the form',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    let receipt = await fixture.answered();
    for (const extra of [
      { confirm: false },
      { revision: 'stale' },
      { requestId: 'foreign' },
    ]) {
      await assert.rejects(
        fixture.service['application-defer'](
          identity(receipt, { confirm: true, ...extra })
        )
      );
    }
    fixture.state.fields[1].value = 'Not acknowledged at review';
    await assert.rejects(fixture.defer(receipt), {
      code: 'jobs-application-changed',
    });
    fixture.state.fields[1].type = 'password';
    receipt = await fixture.service['application-read'](identity(receipt));
    await assert.rejects(fixture.defer(receipt), {
      code: 'jobs-application-draft',
    });
    assert.equal(fixture.state.closed, 0);
    assert.equal((await fixture.queue()).entries.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'queue reopening respects saved exclusions, current browser ownership, fresh queue identity and retained run policies',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    let receipt = await fixture.answered();
    receipt = await fixture.service['application-mode'](
      identity(receipt, { paused: true, noQuestionnaires: true })
    );
    await fixture.defer(receipt);
    const [entry] = (await fixture.queue()).entries;
    assert.equal((await fixture.queue('other')).entries.length, 0);
    for (const extra of [
      { confirm: false },
      { queueId: 'stale' },
      { requestId: 'foreign' },
      { browserSlot: 'other' },
    ]) {
      await assert.rejects(fixture.retry(entry, extra), {
        code: 'jobs-application-queue',
      });
    }
    const choices = await fixture.service['choices-stored']({});
    for (const state of ['skipped', 'deferred']) {
      const saved = await fixture.service['choice-save']({
        ...choices,
        ...entry,
        revision: choices.revision,
        state,
      });
      await assert.rejects(fixture.retry(entry), {
        code: 'jobs-application-excluded',
      });
      const cleared = await fixture.service['choice-clear']({
        ...entry,
        revision: saved.revision,
      });
      choices.revision = cleared.revision;
      assert.equal((await fixture.queue()).entries.length, 1);
    }
    const occupied = await fixture.service['application-open']({
      ...applicationInput,
      recover: true,
    });
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-busy',
    });
    assert.equal((await fixture.queue()).entries.length, 1);
    await fixture.service['application-close'](identity(occupied));
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-questionnaires-held',
    });
    await fixture.service['application-mode'](
      identity(occupied, { noQuestionnaires: false })
    );
    receipt = await fixture.retry(entry);
    assert.equal(receipt.state, 'paused');
    assert.equal(receipt.noQuestionnaires, false);
    assert.equal(receipt.paused, true);
    assert.equal(fixture.state.writes.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'deferral respects HH-scoped canonical corrections while retaining the actual private answer',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    await saveAnswerRule(fixture.store, {
      id: 'hh-owner-correction',
      question: 'Recent experience',
      sources: ['hh'],
      answers: [
        {
          text: 'Canonical owner correction',
          approved: true,
          canonical: true,
        },
      ],
    });
    await fixture.defer(await fixture.answered());
    const rules = await listAnswerRules(fixture.store);
    const correction = rules.find(
      (row) => row.id === 'qa-rule:hh-owner-correction'
    );
    assert.equal(correction.answers.length, 1);
    assert.equal(correction.answers[0].canonical, true);
    assert(
      !rules.some((rule) =>
        rule.answers.some(
          (answer) => answer.text === 'Owner recent storage work.'
        )
      )
    );
    const observation = (await fixture.store.query()).find((row) =>
      row.id.startsWith('secret:jobs-application-answers:')
    );
    assert.equal(observation.fields[0].value, 'Owner recent storage work.');
    assert.equal((await fixture.queue()).entries.length, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'failed reopening keeps its queue entry and drains browser ownership; a later confirmed retry only reviews',
  { timeout: 4000 },
  async (t) => {
    const fault = deferralStorageFault();
    const fixture = applicationDeferralFixture({ store: fault.store });
    t.after(() => fixture.close());
    await fixture.defer(await fixture.answered());
    const [entry] = (await fixture.queue()).entries;
    Object.assign(fault.state, { stage: 'put', kind: 'draft' });
    await assert.rejects(fixture.retry(entry), {
      code: 'fixture-deferral-save',
    });
    assert.equal((await fixture.queue()).entries[0].id, entry.id);
    assert.equal(
      (await fixture.service['application-status'](applicationInput)).active,
      false
    );
    assert.equal(fixture.state.opened, 1);
    const reopened = await fixture.retry(entry);
    assert.equal(reopened.state, 'review');
    assert.equal((await fixture.queue()).entries.length, 0);
    assert.equal(fixture.state.writes.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'unentered vacancy reviews still close at the ordinary idle deadline',
  { timeout: 4000 },
  async (t) => {
    const fixture = applicationDeferralFixture({ application: { idleMs: 5 } });
    t.after(() => fixture.close());
    await fixture.service['application-open'](applicationInput);
    await wait(30);
    assert.equal(fixture.state.closed, 1);
    assert.equal(
      (await fixture.service['application-status'](applicationInput)).active,
      false
    );
    assert.equal((await fixture.queue()).entries.length, 0);
  }
);

test(
  'worker restart forgets queue reasons but preserves recoverable actual drafts and uncertain submission reservations',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    const closed = await fixture.defer(await fixture.answered());
    const [entry] = (await fixture.queue()).entries;
    const row = await fixture.store.get(`secret:jobs-application:jobs:123`);
    await fixture.store.put({
      ...row,
      attempted: { ...row.attempted, submit: true },
      delivery: 'unknown',
    });
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-state',
    });
    assert.equal(fixture.state.opened, 1);
    await fixture.service.stop();
    fixture.service = createVacancyService(fixture.serviceOptions);
    assert.equal((await fixture.queue()).entries.length, 0);
    await assert.rejects(fixture.retry(entry), {
      code: 'jobs-application-queue',
    });
    const status =
      await fixture.service['application-status'](applicationInput);
    assert.equal(status.draft.id, closed.draft.id);
    assert.equal(status.delivery, 'unknown');
    assert.equal(status.attempted.submit, true);
    assert.equal(fixture.state.submitted, 0);
  }
);
