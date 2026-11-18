import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationResult } from '../src/jobs/application-result.js';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { confirmationApplication } from '../../experiments/issue-56/application-confirmation-fixture.mjs';

const options = { confirmations: ['answers', 'send'] };
for (const change of ['answer', 'document', 'chooser']) {
  test(
    `changed ${change} refuses the displayed continuation step`,
    { timeout: 5000 },
    async (t) => {
      const f = await confirmationApplication(t, options);
      await f.progress();
      if (change === 'answer') {
        f.state.fields[1].value = 'Later owner edit';
      }
      if (change === 'document') {
        f.state.page.documentKey = 'replacement-document';
      }
      if (change === 'chooser') {
        f.state.page.resumeChooser = { open: true };
      }
      await assert.rejects(f.progress('answers'), {
        code: 'jobs-application-changed',
      });
      assert.equal(f.state.writes.length, 0);
      assert.equal(f.state.submitted, 0);
    }
  );
}

test(
  'a failed acknowledgement cannot reuse the pending consent or send',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, options);
    await f.progress();
    const put = f.store.put.bind(f.store);
    f.store.put = async () => {
      throw new Error('finite confirmation checkpoint refusal');
    };
    await assert.rejects(
      f.progress('answers'),
      /finite confirmation checkpoint refusal/
    );
    f.store.put = put;
    assert.equal(f.state.submitted, 0);
    await assert.rejects(f.progress('answers'));
    await f.read();
    assert.equal(f.receipt.continuation, null);
  }
);

test(
  'lost Send response retains unknown intent and continuation never replays it',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(
      t,
      { confirmations: [] },
      {
        application: {
          dispatch: async (_handle, _record, action) => {
            if (action === 'submit') {
              throw new Error('finite lost Send response');
            }
            return { dispatched: true };
          },
        },
      }
    );
    // The fixture's overridden entry has no effects; expose the same native questionnaire for review.
    Object.assign(f.state.page, {
      enter: null,
      submit: { qa: 'vacancy-response-submit-popup', disabled: false },
      scope: true,
      questions: true,
      fieldIndices: [1],
    });
    await f.read();
    await assert.rejects(f.progress(), /finite lost Send response/);
    const status = await f.service['application-status'](identity(f.receipt));
    assert.equal(status.delivery, 'unknown');
    assert.equal(status.attempted.submit, true);
    await assert.rejects(f.service['application-continue'](identity(status)), {
      code: 'jobs-application-state',
    });
    assert.equal(f.state.submitted, 0);
  }
);

for (const kind of ['password', 'file', 'open-resume']) {
  test(
    `unsupported ${kind} never becomes permission to Send`,
    { timeout: 5000 },
    async (t) => {
      const f = await confirmationApplication(t, { confirmations: [] });
      if (kind === 'open-resume') {
        f.state.page.resumeChooser = { open: true };
      } else {
        Object.assign(f.state.fields[1], { type: kind, value: 'Owner value' });
        f.state.fields[1].answer.preserveCurrent = true;
      }
      await f.read();
      if (kind === 'open-resume') {
        await assert.rejects(f.progress(), {
          code: 'jobs-application-incomplete',
        });
      } else {
        assert.equal((await f.progress()).continuation.step, 'missing-answers');
      }
      assert.equal(f.state.writes.length, 0);
      assert.equal(f.state.submitted, 0);
    }
  );
}

test(
  'native answer controls still require default Send when the questions marker is absent',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t);
    f.state.page.questions = false;
    await f.read();
    assert.equal((await f.progress()).continuation.step, 'send');
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'a cover-letter-only form continues after attachment without questionnaire Send confirmation',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, {
      confirmations: ['cover-letter', 'send'],
      coverLetter: 'Reviewed letter',
    });
    Object.assign(f.state.page, { questions: false, fieldIndices: [] });
    await f.read();
    assert.equal((await f.progress()).continuation.step, 'cover-letter');
    assert.equal(
      (await f.progress('cover-letter')).delivery,
      'provider-confirmed'
    );
    assert.equal(f.state.page.letter.value, 'Reviewed letter');
    assert.equal(f.state.submitted, 1);
  }
);

test(
  'close and pause invalidate the pending step without a fill',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, options);
    await f.progress();
    f.receipt = await f.service['application-mode'](
      identity(f.receipt, { paused: true })
    );
    assert.equal(f.receipt.continuation, null);
    await assert.rejects(f.progress('answers'), {
      code: 'jobs-application-state',
    });
    const closed = await f.service['application-close'](identity(f.receipt));
    assert.equal(closed.continuation, null);
    assert.equal(f.state.writes.length, 0);
  }
);

test(
  'continuation receipts bind a claimed completion to provider delivery and pending steps to a live review',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, options);
    const receipt = await f.progress();
    for (const change of [
      { continuation: { step: 'complete', confirmationRequired: false } },
      { active: false },
      { paused: true },
      { attempted: { enter: true, submit: true } },
      { state: 'interrupted' },
      { delivery: 'unknown' },
    ]) {
      assert.throws(() =>
        applicationResult({ ...receipt, ...change }, identity(receipt))
      );
    }
    assert.equal(
      applicationResult(receipt, identity(receipt)).continuation.step,
      'answers'
    );
  }
);
