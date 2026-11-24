import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationLimitDraftFixture } from '../../experiments/issue-56/application-limit-draft-fixture.mjs';
import { applicationInput } from '../../experiments/issue-56/application-fixture.mjs';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { deferralStorageFault } from '../../experiments/issue-56/application-deferral-fixture.mjs';
import {
  assertApplicationAnswerObservation,
  assertUnapprovedApplicationLearning,
} from './helpers/application-deferral-assertions.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationDraft } from '../src/jobs/application-draft-data.js';
import {
  applicationLimitId,
  applicationLimitMs,
} from '../src/jobs/application-limit-data.js';

test(
  'a daily refusal automatically preserves actual answers and letter without closing or releasing delivery intent',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    let receipt = await fixture.answered();
    const attempted = globalThis.structuredClone(receipt.attempted);
    receipt = await fixture.limited(receipt);
    assert(
      receipt.draft,
      'The visible daily-limit form needs an automatic recovery draft.'
    );
    assert.deepEqual(
      receipt.draft.fields.map((field) => field.value),
      ['Owner recent storage work.', 'Owner edited cover letter.']
    );
    assert.equal(
      receipt.draft.limit.documentKey,
      fixture.state.page.documentKey
    );
    assert.equal(receipt.draft.limit.until, receipt.applicationLimit.until);
    assert.equal(receipt.active, true);
    assert.equal(receipt.hold, 'daily-limit');
    assert.deepEqual(receipt.attempted, attempted);
    assert.equal(receipt.delivery, 'none');
    assertApplicationAnswerObservation(await fixture.store.query(), receipt);
    await assertUnapprovedApplicationLearning(fixture);
    assert.deepEqual((await fixture.queue()).entries, []);
    assert.equal(fixture.state.closed, 0);
    assert.equal(fixture.state.submitted, 0);
    assert.deepEqual(fixture.state.writes, []);
  }
);

test(
  'unchanged daily reads reuse the draft while actual owner edits refresh it after banner dismissal',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    let receipt = await fixture.limited(await fixture.answered());
    const original = receipt.draft.id;
    const until = receipt.applicationLimit.until;
    receipt = await fixture.read(receipt);
    assert.equal(receipt.draft.id, original);
    fixture.state.page.dailyLimit = false;
    fixture.state.fields[1].value = 'Later owner answer.';
    fixture.state.fields[2].value = 'Later owner letter.';
    receipt = await fixture.read(receipt);
    assert.notEqual(receipt.draft.id, original);
    assert.equal(receipt.applicationLimit.until, until);
    assert.deepEqual(
      receipt.draft.fields.map((field) => field.value),
      ['Later owner answer.', 'Later owner letter.']
    );
    assertApplicationAnswerObservation(await fixture.store.query(), receipt);
    assert.equal(fixture.state.closed, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'a shared pause preserves another live form even without its own refusal banner',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    let receipt = await fixture.answered();
    await fixture.store.put({
      id: applicationLimitId,
      version: 1,
      scope: 'workspace',
      documentKey: 'other-slot-refusal',
      observedAt: new Date(fixture.clock.value).toISOString(),
      until: new Date(fixture.clock.value + applicationLimitMs).toISOString(),
    });
    receipt = await fixture.read(receipt);
    assert.equal(receipt.hold, null);
    assert.equal(receipt.draft.fields[0].value, 'Owner recent storage work.');
    assert.equal(receipt.draft.limit.until, receipt.applicationLimit.until);
    assert.equal(fixture.state.closed, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'worker recovery keeps the prior backed values when a fresh native document opens empty',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    let receipt = await fixture.answered();
    fixture.state.page.documentKey = 'original-limit-document';
    receipt = await fixture.limited(receipt);
    const draft = globalThis.structuredClone(receipt.draft);
    await fixture.service.stop();
    fixture.service = createVacancyService(fixture.serviceOptions);
    receipt = await fixture.service['application-open']({
      ...identity(receipt),
      recover: true,
    });
    assert.deepEqual(receipt.draft, draft);
    assert.deepEqual(
      fixture.state.fields.slice(1).map((field) => field.value),
      ['', '']
    );
    receipt = await fixture.read(receipt);
    assert.deepEqual(receipt.draft, draft);
    await assert.rejects(
      fixture.service['application-restore'](
        identity(receipt, { confirm: true })
      ),
      { code: 'jobs-application-limit-wait' }
    );
    fixture.clock.value = Date.parse(receipt.applicationLimit.until);
    receipt = await fixture.read(receipt);
    receipt = await fixture.service['application-restore'](
      identity(receipt, { confirm: true })
    );
    assert.equal(receipt.restoration.state, 'restored');
    assert.deepEqual(
      fixture.state.fields.slice(1).map((field) => field.value),
      draft.fields.map((field) => field.value)
    );
    assert.equal(fixture.state.submitted, 0);
  }
);

for (const stage of ['put', 'flush']) {
  for (const kind of ['draft', 'answers', 'learning']) {
    test(
      `daily-limit ${kind} ${stage} failure retains the native form and a later read retries safely`,
      { timeout: 5000 },
      async (t) => {
        const fault = deferralStorageFault();
        const fixture = applicationLimitDraftFixture(t, { store: fault.store });
        const before = await fixture.answered();
        Object.assign(fault.state, {
          stage,
          kind,
          when: (row) => kind !== 'draft' || Boolean(row.draft?.limit),
        });
        await assert.rejects(fixture.limited(before), {
          code: 'fixture-deferral-save',
        });
        assert.equal(fault.state.hits, 1);
        const status = await fixture.status(before);
        assert.equal(status.active, true);
        assert.equal(status.applicationLimit.active, true);
        assert.equal(fixture.state.closed, 0);
        assert.deepEqual(
          fixture.state.fields.slice(1).map((field) => field.value),
          ['Owner recent storage work.', 'Owner edited cover letter.']
        );
        const receipt = await fixture.read(status);
        assertApplicationAnswerObservation(
          await fixture.store.query(),
          receipt
        );
        await assertUnapprovedApplicationLearning(fixture);
        assert.equal(fixture.state.submitted, 0);
        assert.equal((await fixture.queue()).entries.length, 0);
      }
    );
  }
}

test(
  'an owner edit during the private answer checkpoint refuses the stale capture and the next read preserves the edit',
  { timeout: 5000 },
  async (t) => {
    const fault = deferralStorageFault();
    const fixture = applicationLimitDraftFixture(t, { store: fault.store });
    const before = await fixture.answered();
    fault.state.hook = async (row) => {
      if (row.id.startsWith('secret:jobs-application-answers:')) {
        fault.state.hook = null;
        fixture.state.fields[1].value = 'Owner edit during checkpoint.';
      }
    };
    await assert.rejects(fixture.limited(before), {
      code: 'jobs-application-changed',
    });
    const receipt = await fixture.read(await fixture.status(before));
    assert.equal(
      receipt.draft.fields[0].value,
      'Owner edit during checkpoint.'
    );
    assert.equal(fixture.state.closed, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'pause blocks automatic local preservation until the owner resumes the existing review',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    let receipt = await fixture.answered();
    receipt = await fixture.service['application-mode'](
      identity(receipt, { paused: true })
    );
    receipt = await fixture.limited(receipt);
    assert.equal(receipt.draft, null);
    receipt = await fixture.service['application-mode'](
      identity(receipt, { paused: false })
    );
    assert.equal(receipt.draft.fields[0].value, 'Owner recent storage work.');
    assert.equal(fixture.state.closed, 0);
  }
);

test(
  'preview never creates a daily-limit answer backup',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    let receipt = await fixture.service['application-open']({
      ...applicationInput,
      testMode: true,
    });
    Object.assign(fixture.state.page, {
      scope: true,
      questions: true,
      enter: null,
      submit: { qa: 'vacancy-response-letter-submit', disabled: false },
    });
    fixture.state.fields[1].value = 'Preview owner answer.';
    receipt = await fixture.limited(receipt);
    assert.equal(receipt.draft, null);
    assert.deepEqual(fixture.state.writes, []);
  }
);

test(
  'incomplete inspections retain the native daily-limit form without claiming a backup',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    const receipt = await fixture.answered();
    fixture.hooks.report = (report) => ({ ...report, coverage: 'partial' });
    await assert.rejects(fixture.limited(receipt));
    assert.equal((await fixture.status(receipt)).active, true);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'automatic daily backups retain an interrupted, unknown send reservation',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    let receipt = await fixture.answered();
    await fixture.service.stop();
    const row = await fixture.store.get('secret:jobs-application:jobs:123');
    row.attempted.submit = true;
    row.delivery = 'unknown';
    await fixture.store.put(row);
    fixture.service = createVacancyService(fixture.serviceOptions);
    receipt = await fixture.service['application-open']({
      ...identity(receipt),
      recover: true,
    });
    fixture.state.fields[1].value = 'Uncertain send owner answer.';
    receipt = await fixture.limited(receipt);
    assert.equal(receipt.draft.fields[0].value, 'Uncertain send owner answer.');
    assert.equal(receipt.attempted.submit, true);
    assert.equal(receipt.delivery, 'unknown');
    assert.equal(fixture.state.submitted, 0);
    assert.equal(
      fixture.state.closed,
      1,
      'Only the explicitly stopped old browser was closed.'
    );
  }
);

test(
  'malformed daily-limit draft provenance is rejected alongside the existing draft guards',
  { timeout: 5000 },
  async (t) => {
    const fixture = applicationLimitDraftFixture(t);
    const receipt = await fixture.limited(await fixture.answered());
    for (const limit of [
      { documentKey: '', until: receipt.applicationLimit.until },
      { documentKey: 'native', until: 'not-a-date' },
      false,
    ]) {
      assert.throws(() => applicationDraft({ ...receipt.draft, limit }), {
        code: 'jobs-application-draft',
      });
    }
  }
);
