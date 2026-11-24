import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createVacancyService } from '../src/jobs/service.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import {
  storedDeferredQuestions,
  pendingDeferredVacancies,
  saveDeferredQuestions,
} from '../src/jobs/deferred-questions.js';
import {
  deferredQuestionId,
  deferredQuestionResult,
} from '../src/jobs/deferred-question-data.js';
import {
  ownedDeferralFixture,
  deferralStorageFault,
  identity,
} from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';

const change = (fixture, input) =>
  fixture.service['question-change']({
    action: 'save',
    question: 'Recent experience',
    mode: 'until-answered',
    revision: 'empty',
    ...input,
  });
const defer = (fixture, receipt, input) =>
  fixture.service['application-defer-questions'](
    identity(receipt, { confirm: true, ...input })
  );

test(
  'explicit unanswered-question deferral survives restart without joining the session queue or sending',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    const receipt = await fixture.enter();
    const closed = await defer(fixture, receipt);
    assert.equal(closed.state, 'closed');
    const saved = await storedDeferredQuestions(fixture.store);
    assert.deepEqual(
      saved.entries.map((row) => [row.question, row.mode, row.vacancies]),
      [['Recent experience', 'until-answered', [applicationInput.url]]]
    );
    assert.equal((await fixture.queue()).entries.length, 0);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.writes.length, 0);
    await fixture.service.stop();
    const restarted = createVacancyService(fixture.serviceOptions);
    t.after(() => restarted.stop());
    assert.deepEqual(await restarted['questions-stored']({}), saved);
    await assert.rejects(
      restarted['application-open']({ ...applicationInput, recover: true }),
      { code: 'jobs-application-question-deferred' }
    );
    assert.equal(fixture.state.opened, 1);
    assert.deepEqual((await restarted['application-queue']({})).entries, []);
  }
);

test(
  'a complete HH answer releases the associated vacancy for fresh review; foreign-source answers do not',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    await defer(fixture, await fixture.enter());
    const rule = {
      id: 'deferred-eligibility',
      question: 'Recent experience',
      answers: [
        { text: 'Owner supplied experience', approved: true, canonical: true },
      ],
    };
    await saveAnswerRule(fixture.store, { ...rule, sources: ['vk'] });
    assert(
      (await pendingDeferredVacancies(fixture.store)).has(applicationInput.url)
    );
    await saveAnswerRule(fixture.store, { ...rule, sources: ['hh'] });
    assert(
      !(await pendingDeferredVacancies(fixture.store)).has(applicationInput.url)
    );
    const fresh = await fixture.service['application-open']({
      ...applicationInput,
      recover: true,
    });
    assert.equal(fresh.state, 'review');
    assert.equal(fixture.state.fields[1].value, '');
    assert.equal(fixture.state.writes.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a newly saved fragment preserves and closes a matching waiting form with a policy receipt',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    await fixture.enter();
    const saved = await change(fixture, { question: 'experience' });
    assert.equal(saved.entries.length, 1);
    assert.deepEqual(saved.entries[0].vacancies, [applicationInput.url]);
    assert.equal(fixture.state.closed, 1);
    assert.equal((await fixture.queue()).entries.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'until-answered retains actual owner answers; always also defers an answered question',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    await fixture.answered();
    const saved = await change(fixture);
    assert.equal(fixture.state.closed, 0);
    assert.equal(saved.entries[0].vacancies.length, 0);
    await change(fixture, { revision: saved.revision, mode: 'always' });
    assert.equal(fixture.state.closed, 1);
    assert(
      (await pendingDeferredVacancies(fixture.store)).has(applicationInput.url)
    );
    const answers = (await fixture.store.query()).find((row) =>
      row.id.startsWith('secret:jobs-application-answers:')
    );
    assert.equal(answers.fields[0].value, 'Owner recent storage work.');
  }
);

test(
  'durable policy edits require the exact observed revision and explicit removal',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    const saved = await change(fixture);
    await assert.rejects(change(fixture), {
      code: 'jobs-question-deferral-conflict',
    });
    const removed = await change(fixture, {
      action: 'remove',
      entryId: saved.entries[0].id,
      revision: saved.revision,
    });
    assert.deepEqual(removed.entries, []);
    await assert.rejects(
      change(fixture, {
        action: 'remove',
        entryId: saved.entries[0].id,
        revision: removed.revision,
      }),
      { code: 'jobs-question-deferral-conflict' }
    );
    assert.deepEqual(
      (await storedDeferredQuestions(fixture.store, { browserSlot: 'other' }))
        .entries,
      []
    );
  }
);

for (const stage of ['put', 'flush']) {
  test(
    `refused question-policy ${stage} retains the owned form and acknowledged policy`,
    { timeout: 4000 },
    async (t) => {
      const fault = deferralStorageFault();
      const fixture = ownedDeferralFixture(t, { store: fault.store });
      const receipt = await fixture.enter();
      Object.assign(fault.state, {
        stage,
        kind: 'draft',
        when: (row) => row.id.startsWith('secret:jobs-deferred-questions:'),
      });
      await assert.rejects(defer(fixture, receipt), {
        code: 'fixture-deferral-save',
      });
      assert.equal(fixture.state.closed, 0);
      assert.equal(fixture.state.submitted, 0);
      assert.deepEqual(
        (await storedDeferredQuestions(fixture.store)).entries,
        []
      );
    }
  );
}

test(
  'a policy change during idle is observed and the owned watcher drains on stop',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t, {
      application: { questionWatchMs: 5 },
    });
    await fixture.enter();
    const before = await storedDeferredQuestions(fixture.store);
    await saveDeferredQuestions(fixture.store, before, [
      {
        id: globalThis.crypto.randomUUID(),
        question: 'Recent experience',
        mode: 'until-answered',
        vacancies: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    for (let count = 0; count < 100 && !fixture.state.closed; count++) {
      await wait(5);
    }
    assert.equal(fixture.state.closed, 1);
    assert.deepEqual(
      (await storedDeferredQuestions(fixture.store)).entries[0].vacancies,
      [applicationInput.url]
    );
    await fixture.service.stop();
    const revision = (await storedDeferredQuestions(fixture.store)).revision;
    await wait(15);
    assert.equal(
      (await storedDeferredQuestions(fixture.store)).revision,
      revision
    );
  }
);

test('stored policy rejects ambiguous identities, duplicate associations and oversized questions', () => {
  const row = {
    id: globalThis.crypto.randomUUID(),
    question: 'Recent experience',
    mode: 'always',
    vacancies: [applicationInput.url],
    createdAt: new Date().toISOString(),
  };
  const saved = {
    version: 1,
    browserSlot: 'jobs',
    revision: globalThis.crypto.randomUUID(),
    entries: [row],
  };
  assert.equal(
    deferredQuestionId('jobs'),
    'secret:jobs-deferred-questions:jobs'
  );
  for (const entries of [
    [row, row],
    [{ ...row, vacancies: [applicationInput.url, applicationInput.url] }],
    [{ ...row, question: 'x'.repeat(6001) }],
    [{ ...row, mode: 'unknown' }],
  ]) {
    assert.throws(() => deferredQuestionResult({ ...saved, entries }));
  }
  assert.throws(() => deferredQuestionResult({ ...saved, revision: 'empty' }));
  assert.throws(() => deferredQuestionResult(saved, { browserSlot: 'other' }));
});
