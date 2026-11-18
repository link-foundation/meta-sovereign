import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAnswerRule } from '../src/automation/question-store.js';
import {
  pendingDeferredVacancies,
  storedDeferredQuestions,
} from '../src/jobs/deferred-questions.js';
import {
  ownedDeferralFixture,
  deferralStorageFault,
  identity,
} from '../../experiments/issue-56/application-deferral-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';

const change = (fixture, input = {}) =>
  fixture.service['question-change']({
    action: 'save',
    question: 'Recent experience',
    mode: 'until-answered',
    revision: 'empty',
    ...input,
  });
const defer = (fixture, receipt, confirm = true) =>
  fixture.service['application-defer-questions'](
    identity(receipt, { confirm })
  );

test(
  'durable deferral requires consent and an actually unanswered question',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    let receipt = await fixture.enter();
    await assert.rejects(defer(fixture, receipt, false));
    assert.equal(fixture.state.closed, 0);
    assert.deepEqual(
      (await storedDeferredQuestions(fixture.store)).entries,
      []
    );
    fixture.state.fields[1].value = 'An actual owner answer';
    receipt = await fixture.service['application-read'](identity(receipt));
    await assert.rejects(defer(fixture, receipt), {
      code: 'jobs-question-deferral-input',
    });
    assert.equal(fixture.state.closed, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'an unchecked checkbox stays unanswered and its group question is persisted',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    Object.assign(fixture.state.fields[1], {
      type: 'checkbox',
      checked: false,
      value: 'yes',
      group: { label: 'Are you available for relocation?' },
    });
    const receipt = await fixture.enter();
    await defer(fixture, receipt);
    assert.equal(
      (await storedDeferredQuestions(fixture.store)).entries[0].question,
      'Are you available for relocation?'
    );
    assert.equal(fixture.state.fields[1].checked, false);
    assert.equal(fixture.state.writes.length, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'paused reviews do not close automatically when a matching policy is saved',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    let receipt = await fixture.enter();
    receipt = await fixture.service['application-mode'](
      identity(receipt, { paused: true })
    );
    const saved = await change(fixture);
    assert.deepEqual(saved.entries[0].vacancies, []);
    assert.equal(fixture.state.closed, 0);
    await assert.rejects(defer(fixture, receipt), {
      code: 'jobs-application-state',
    });
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'late owner edits during the acknowledged policy checkpoint retain the form',
  { timeout: 4000 },
  async (t) => {
    const fault = deferralStorageFault();
    const fixture = ownedDeferralFixture(t, { store: fault.store });
    const receipt = await fixture.enter();
    fault.state.hook = async (row) => {
      if (row.id.startsWith('secret:jobs-deferred-questions:')) {
        fixture.state.fields[1].value = 'Late private owner answer';
      }
    };
    await assert.rejects(defer(fixture, receipt));
    assert.equal(fixture.state.closed, 0);
    assert.equal(fixture.state.fields[1].value, 'Late private owner answer');
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'saved answer eligibility observes chat scope and unresolved profile templates',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    await defer(fixture, await fixture.enter());
    const rule = {
      id: 'deferred-scope',
      question: 'Recent experience',
      sources: ['hh'],
      answers: [
        { text: 'A scoped owner answer', approved: true, canonical: true },
      ],
    };
    await saveAnswerRule(fixture.store, {
      ...rule,
      chats: ['hh:https://hh.ru/vacancy/456'],
    });
    assert(
      (await pendingDeferredVacancies(fixture.store)).has(applicationInput.url)
    );
    await saveAnswerRule(fixture.store, {
      ...rule,
      chats: [`hh:${applicationInput.url}`],
    });
    assert(
      !(await pendingDeferredVacancies(fixture.store)).has(applicationInput.url)
    );
    await saveAnswerRule(fixture.store, {
      ...rule,
      answers: [
        {
          text: 'Experience: {{missing_detail}}',
          approved: true,
          canonical: true,
        },
      ],
    });
    assert(
      (await pendingDeferredVacancies(fixture.store)).has(applicationInput.url)
    );
  }
);

test(
  'native-confirmed delivery forgets answered vacancy associations',
  { timeout: 4000 },
  async (t) => {
    const fixture = ownedDeferralFixture(t);
    await defer(fixture, await fixture.enter());
    await saveAnswerRule(fixture.store, {
      id: 'deferred-delivery',
      question: 'Recent experience',
      sources: ['hh'],
      answers: [{ text: 'Owner answer', approved: true, canonical: true }],
    });
    const receipt = await fixture.service['application-open']({
      ...applicationInput,
      recover: true,
    });
    fixture.state.page.delivered = true;
    const delivered = await fixture.service['application-read'](
      identity(receipt)
    );
    assert.equal(delivered.delivery, 'provider-confirmed');
    assert.deepEqual(
      (await storedDeferredQuestions(fixture.store)).entries,
      []
    );
    assert.equal(fixture.state.submitted, 0);
  }
);
