import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { applicationSettings } from '../src/jobs/application-options.js';
import { readApplicationJournal } from '../src/jobs/application-journal.js';
import {
  applicationBatchOptions,
  readApplicationBatch,
} from '../src/jobs/application-batch-data.js';
import { watchApplicationFeedback } from '../src/jobs/application-feedback.js';

test('survey setting defaults on without rewriting legacy review or batch signatures', () => {
  const options = applicationSettings(applicationInput);
  assert.equal(Object.hasOwn(options, 'autoAnswerViewedVacancy'), false);
  assert.deepEqual(applicationSettings(options, { legacy: true }), options);
  const batch = applicationBatchOptions({
    ...applicationInput,
    urls: [applicationInput.url],
  });
  assert.equal(Object.hasOwn(batch.review, 'autoAnswerViewedVacancy'), false);
  const saved = {
    version: 1,
    id: batch.id,
    options: batch,
    signature: JSON.stringify(batch),
    phase: 'completed',
    active: false,
    revision: globalThis.crypto.randomUUID(),
    startedAt: '2026-11-14T00:00:00.000Z',
    expiresAt: '2026-11-15T00:00:00.000Z',
    nextAt: null,
    code: null,
    cursor: 1,
    delivered: [],
    skipped: batch.urls,
    currentUrl: null,
  };
  assert.equal(readApplicationBatch(saved, batch).signature, saved.signature);
  for (const value of ['false', null, 0, {}]) {
    assert.throws(() =>
      applicationSettings({
        ...applicationInput,
        autoAnswerViewedVacancy: value,
      })
    );
  }
});

test(
  'owned review attaches and drains its frozen policy, while status and restart never attach',
  { timeout: 5000 },
  async (t) => {
    const calls = [];
    const fixture = applicationFixture({
      application: {
        watchFeedback: async (_browser, options) => {
          calls.push(options.autoAnswerViewedVacancy ?? true);
          return async () => calls.push('stopped');
        },
      },
    });
    t.after(() => fixture.close());
    let receipt = await fixture.service['application-open'](applicationInput);
    assert.equal(receipt.autoAnswerViewedVacancy, true);
    assert.deepEqual(calls, [true]);
    await fixture.service['application-status'](applicationInput);
    assert.deepEqual(calls, [true]);
    const row = await fixture.store.get(
      applicationSettings(applicationInput).id
    );
    assert.equal(
      readApplicationJournal(row, applicationSettings(applicationInput))
        .signature,
      row.signature
    );
    await fixture.service['application-close']({
      ...applicationInput,
      revision: receipt.revision,
    });
    assert.deepEqual(calls, [true, 'stopped']);
    receipt = await fixture.service['application-open'](applicationInput);
    assert.equal(receipt.active, false);
    assert.deepEqual(calls, [true, 'stopped']);
    assert.equal(fixture.state.entered, 0);
    assert.equal(fixture.state.submitted, 0);
  }
);

test('native watcher installs before navigation and preview/opt-out never install or evaluate', async () => {
  const calls = [];
  const page = {
    addInitScript: async (_fn, input) => calls.push(['init', input]),
    evaluate: async (_fn, input) => calls.push(['evaluate', input]),
    isClosed: () => false,
  };
  for (const options of [
    { testMode: true },
    { autoAnswerViewedVacancy: false },
  ]) {
    assert.equal(
      await watchApplicationFeedback(
        { page },
        { ...applicationInput, ...options }
      ),
      undefined
    );
  }
  assert.deepEqual(calls, []);
  const stop = await watchApplicationFeedback({ page }, applicationInput);
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['init', 'evaluate']
  );
  await stop();
  assert.equal(calls.at(-1)[1].stop, true);
});
