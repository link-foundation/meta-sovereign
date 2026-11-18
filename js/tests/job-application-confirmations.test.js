import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationSettings } from '../src/jobs/application-options.js';
import { applicationResult } from '../src/jobs/application-result.js';
import { applicationConfirmations } from '../src/jobs/application-confirmations.js';
import { applicationIdentity as identity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { confirmationApplication } from '../../experiments/issue-56/application-confirmation-fixture.mjs';

const pending = (receipt, step) =>
  assert.deepEqual(receipt.continuation, {
    step,
    confirmationRequired: step !== 'missing-answers',
  });

test(
  'continuation pauses at the default questionnaire Send after exact empty-field filling',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t);
    assert.equal(
      typeof f.service['application-continue'],
      'function',
      'independent continuation is absent'
    );
    const receipt = await f.progress();
    pending(receipt, 'send');
    assert.equal(f.state.fields[1].value, 'Reviewed answer');
    assert.equal(f.state.fields[0].value, '');
    assert.equal(f.state.submitted, 0);
    assert.deepEqual(receipt.confirmations, ['send']);
    pending(await f.service['application-status'](identity(receipt)), 'send');
    assert.equal(f.state.submitted, 0);
    assert.equal((await f.progress('send')).delivery, 'provider-confirmed');
    assert.equal(f.state.submitted, 1);
  }
);

test(
  'independent selected steps require separate current confirmations',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, {
      confirmations: ['answers', 'cover-letter', 'send'],
      coverLetter: 'Chosen letter',
    });
    pending(await f.progress(), 'answers');
    assert.equal(f.state.writes.length, 0);
    await assert.rejects(f.progress('send'), {
      code: 'jobs-application-confirmation',
    });
    pending(await f.progress('answers'), 'cover-letter');
    assert.equal(f.state.page.letter, null);
    pending(await f.progress('cover-letter'), 'send');
    assert.equal(f.state.page.letter.value, 'Chosen letter');
    assert.equal(f.state.submitted, 0);
    assert.equal((await f.progress('send')).delivery, 'provider-confirmed');
    await assert.rejects(f.progress('send'), {
      code: 'jobs-application-state',
    });
    assert.equal(f.state.submitted, 1);
  }
);

test(
  'none permits a bounded explicitly requested continuation through one Send',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, {
      confirmations: [],
      coverLetter: 'Allowed letter',
    });
    const receipt = await f.progress();
    assert.equal(receipt.delivery, 'provider-confirmed');
    assert.deepEqual(receipt.continuation, {
      step: 'complete',
      confirmationRequired: false,
    });
    assert.equal(f.state.submitted, 1);
  }
);

test(
  'popup confirmation precedes all short-form fills and independent answer confirmation',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, {
      confirmations: ['popup', 'answers', 'send'],
    });
    f.state.page.url = f.receipt.url;
    // A fresh review on the vacancy page is a short native popup.
    const saved = await f.store.get(`secret:jobs-application:jobs:123`);
    saved.resumeUrl = null;
    await f.service['application-close'](identity(f.receipt));
    await f.store.put(saved);
    f.receipt = await f.service['application-open']({
      ...identity(f.receipt),
      recover: true,
    });
    pending(await f.progress(), 'popup');
    assert.equal(f.state.writes.length, 0);
    pending(await f.progress('popup'), 'answers');
    pending(await f.progress('answers'), 'send');
  }
);

test(
  'only this continuation own empty-field autofill may use the exact-answer exception',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, { autoExact: true });
    assert.equal((await f.progress()).delivery, 'provider-confirmed');
    assert.equal(f.state.submitted, 1);
  }
);

test(
  'already matching owner answers still require Send confirmation',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, { autoExact: true });
    f.state.fields[1].value = 'Reviewed answer';
    await f.read();
    pending(await f.progress(), 'send');
    assert.equal(f.state.writes.length, 0);
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'a new read loses autofill authority and never silently resumes',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, {
      autoExact: true,
      confirmations: ['answers', 'cover-letter', 'send'],
      coverLetter: 'Reviewed letter',
    });
    pending(await f.progress(), 'answers');
    pending(await f.progress('answers'), 'cover-letter');
    await f.read();
    assert.equal(f.receipt.continuation, null);
    await assert.rejects(f.progress('cover-letter'), {
      code: 'jobs-application-confirmation',
    });
    pending(await f.progress(), 'cover-letter');
    pending(await f.progress('cover-letter'), 'send');
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'missing answers hold even when no steps request confirmation',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, { confirmations: [] });
    f.state.fields[1].answer.source = 'none';
    f.state.fields[1].answer.complete = false;
    f.state.fields[1].answer.proposal = null;
    await f.read();
    pending(await f.progress(), 'missing-answers');
    assert.equal(f.state.submitted, 0);
    f.state.fields[1].value = 'Owner supplied response';
    await f.read();
    assert.equal((await f.progress()).delivery, 'provider-confirmed');
  }
);

for (const marker of ['challenge', 'dailyLimit', 'external']) {
  test(
    `late ${marker} refuses continuation before any fill or send`,
    { timeout: 5000 },
    async (t) => {
      const f = await confirmationApplication(t, { confirmations: [] });
      f.state.page[marker] = true;
      await assert.rejects(f.progress());
      assert.equal(f.state.writes.length, 0);
      assert.equal(f.state.submitted, 0);
    }
  );
}

test(
  'supervised policy overrides none and never uses automatic sending',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, {
      supervised: true,
      confirmations: [],
      autoExact: true,
    });
    pending(await f.progress(), 'answers');
    pending(await f.progress('answers'), 'send');
    assert.equal(f.state.submitted, 0);
    assert.deepEqual(f.receipt.confirmations, [
      'answers',
      'cover-letter',
      'send',
      'popup',
    ]);
  }
);

test(
  'preview continuation has no fill, navigation or dispatch effects',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, {
      testMode: true,
      confirmations: [],
    });
    const opened = f.state.opened;
    assert.equal((await f.progress()).state, 'test-preview');
    assert.equal(f.state.writes.length, 0);
    assert.equal(f.state.entered, 0);
    assert.equal(f.state.submitted, 0);
    assert.equal(f.state.opened, opened);
  }
);

test(
  'configuration is canonical, frozen and strict while legacy signatures are retained',
  { timeout: 5000 },
  async (t) => {
    assert.deepEqual(applicationConfirmations(['popup', 'answers']), [
      'answers',
      'popup',
    ]);
    for (const value of [null, 'none', ['send', 'send'], ['other'], [true]]) {
      assert.throws(() => applicationConfirmations(value));
    }
    const f = await confirmationApplication(t, { confirmations: ['answers'] });
    await assert.rejects(
      f.service['application-open']({
        ...identity(f.receipt),
        confirmations: [],
      }),
      { code: 'jobs-application-conflict' }
    );
    assert.equal(
      Object.hasOwn(
        applicationSettings({ ...identity(f.receipt) }, { legacy: true }),
        'confirmations'
      ),
      false
    );
  }
);

test(
  'restart retains choices without carrying confirmation or autofill authority',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t, {
      confirmations: ['answers', 'send'],
    });
    pending(await f.progress(), 'answers');
    await f.service.stop();
    f.service = createVacancyService(f.serviceOptions);
    const status = await f.service['application-status'](identity(f.receipt));
    assert.equal(status.state, 'interrupted');
    assert.equal(status.continuation, null);
    assert.deepEqual(status.confirmations, ['answers', 'send']);
    f.receipt = await f.service['application-open']({
      ...identity(status),
      recover: true,
    });
    pending(await f.progress(), 'answers');
    assert.equal(f.state.submitted, 0);
  }
);

test(
  'malformed public choices and continuation receipts are refused',
  { timeout: 5000 },
  async (t) => {
    const f = await confirmationApplication(t);
    for (const change of [
      { confirmations: ['typo'] },
      { continuation: { step: 'send', confirmationRequired: 'true' } },
      { continuation: { step: 'complete', confirmationRequired: true } },
    ]) {
      assert.throws(() =>
        applicationResult({ ...f.receipt, ...change }, identity(f.receipt))
      );
    }
  }
);
