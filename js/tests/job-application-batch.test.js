import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  applicationBatchFixture,
  batchInput,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import {
  applicationBatchOptions,
  applicationBatchResult,
} from '../src/jobs/application-batch-data.js';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';

const options = { timeout: 5000 };
test(
  'finite batch follows saved pacing and counts only acknowledged native delivery',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    assert.equal(
      typeof f.service['application-batch-start'],
      'function',
      'paced batch orchestration is absent'
    );
    await f.start();
    const result = await f.until((r) => r.batch?.phase === 'completed');
    assert.equal(result.batch.delivered, 2);
    assert.equal(result.batch.cursor, 2);
    assert.equal(f.state.submitted, 2);
    assert.equal(f.state.closed, 2);
    assert.equal(f.state.entered, 0);
    assert(f.state.admissions[1].at - f.state.admissions[0].at >= 2000);
    assert.equal((await f.start()).batch.delivered, 2);
    assert.equal(f.state.opened, 2, 'repeated Start is a receipt lookup');
    applicationBatchResult(result, batchInput);
  }
);
test(
  'the default Send confirmation holds the batch until the current step is authorized',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ confirmations: ['send'], maxApplications: 1 });
    const waiting = await f.until(
      (r) => r.application?.continuation?.step === 'send'
    );
    assert.equal(waiting.batch.delivered, 0);
    assert.equal(f.state.submitted, 0);
    await delay(10);
    const same = await f.status();
    assert.equal(
      same.application.revision,
      waiting.application.revision,
      'status must retain displayed confirmation'
    );
    await f.confirm('send');
    assert.equal(
      (await f.until((r) => r.batch.phase === 'completed')).batch.delivered,
      1
    );
    assert.equal(f.state.opened, 1);
  }
);
test(
  'a manual native Send withdraws pending review and counts once toward the maximum',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ confirmations: ['send'], maxApplications: 1 });
    await f.until((r) => r.application?.continuation?.step === 'send');
    f.state.page.delivered = true;
    const result = await f.until((r) => r.batch.phase === 'completed');
    assert.equal(result.batch.delivered, 1);
    assert.equal(f.state.submitted, 0);
    assert.equal(f.state.opened, 1);
  }
);
test(
  'SIGUSR2 enables automatic RAM revisits with fresh documents and restored actual answers',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ noQuestionnaires: true, confirmations: ['send'] });
    const held = await f.until((r) => r.batch.phase === 'questionnaires-held');
    assert.equal(held.batch.delivered, 0);
    assert.equal(f.state.closed, 2);
    assert.equal((await f.service['application-queue']({})).entries.length, 2);
    f.service['application-signal-mode']({
      url: batchUrls[0],
      noQuestionnaires: false,
    });
    const reopened = await f.until(
      (r) => r.application?.continuation?.step === 'send'
    );
    assert.equal(reopened.application.url, batchUrls[0]);
    assert.equal(reopened.application.restoration.state, 'restored');
    assert.equal(f.state.opened, 3);
    await f.confirm('send');
    await f.until(
      (r) =>
        r.application?.url === batchUrls[1] &&
        r.application.continuation?.step === 'send'
    );
    await f.confirm('send');
    assert.equal(
      (await f.until((r) => r.batch.phase === 'completed')).batch.delivered,
      2
    );
    assert.equal((await f.service['application-queue']({})).entries.length, 0);
  }
);
test(
  'pause and resume between vacancies retain the same saved pacing schedule',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ confirmations: ['send'] });
    await f.until((r) => r.application?.continuation?.step === 'send');
    await f.mode({ paused: true });
    await f.until((r) => r.batch.phase === 'paused');
    const before = f.state.opened;
    await delay(10);
    assert.equal(f.state.opened, before);
    await f.mode({ paused: false });
    const receipt = await f.until((r) => r.application?.state === 'review');
    const current = await f.service['application-continue'](
      applicationIdentity(receipt.application)
    );
    assert.equal(current.continuation.step, 'send');
    await f.confirm('send');
    await f.until((r) => r.application?.url === batchUrls[1]);
    assert(f.state.admissions[1].at - f.state.admissions[0].at >= 2000);
  }
);
test(
  'stopping drains the owned batch and preserves its current form without another send',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ confirmations: ['send'] });
    await f.until((r) => r.application?.continuation?.step === 'send');
    const stopped = await f.stop();
    assert.equal(stopped.batch.phase, 'stopped');
    assert.equal(stopped.batch.active, false);
    assert.equal(stopped.application.active, true);
    assert.equal(f.state.closed, 0);
    await delay(10);
    assert.equal(f.state.opened, 1);
    assert.equal(f.state.submitted, 0);
  }
);
test(
  'worker restart cannot recreate a saved batch or RAM exclusions',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ noQuestionnaires: true, confirmations: ['send'] });
    await f.until((r) => r.batch.phase === 'questionnaires-held');
    const saved = await f.store.get(
      'secret:jobs-application-batch:jobs:fixture-batch'
    );
    await f.stop();
    await f.service.stop();
    await f.store.put(saved); // Simulate a worker lost before its final acknowledgement.
    f.service = createVacancyService(f.serviceOptions);
    const recovered = await f.status();
    assert.equal(recovered.batch.phase, 'interrupted');
    assert.equal(recovered.batch.active, false);
    assert.equal(recovered.batch.noQuestionnaires, false);
    assert.equal((await f.service['application-queue']({})).entries.length, 0);
    const before = f.state.opened;
    const again = await f.start({
      noQuestionnaires: true,
      confirmations: ['send'],
    });
    assert.equal(again.batch.phase, 'interrupted');
    assert.equal(f.state.opened, before);
  }
);
test(
  'uncertain native dispatch refuses the batch and preserves its reservation',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    f.state.unknownSend = true;
    await f.start();
    const receipt = await f.until((r) => r.batch.phase === 'refused');
    assert.equal(receipt.batch.delivered, 0);
    assert.equal(receipt.application.delivery, 'unknown');
    assert.equal(receipt.application.attempted.submit, true);
    assert.equal(f.state.submitted, 1);
    assert.equal(f.state.opened, 1);
  }
);
test(
  'durable owner exclusions remain in force for fresh admission',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    const choices = await f.service['choices-stored']({});
    await f.service['choice-save']({
      url: batchUrls[0],
      title: 'Owner exclusion',
      state: 'deferred',
      revision: choices.revision,
    });
    await f.start();
    const result = await f.until((r) => r.batch.phase === 'completed');
    assert.equal(result.batch.skipped, 1);
    assert.equal(result.batch.delivered, 1);
    assert.equal(f.state.opened, 1);
  }
);
test(
  'finite preview creates no browser, field or delivery effects',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    const result = await f.start({ testMode: true });
    assert.equal(result.batch.phase, 'completed');
    assert.equal(result.batch.delivered, 0);
    assert.equal(f.state.opened, 0);
    assert.equal(f.state.submitted, 0);
  }
);
test(
  'batch limits and canonical identity reject unsafe or conflicting settings',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    for (const change of [
      { urls: [] },
      { urls: [...batchUrls, batchUrls[0]] },
      { urls: ['https://example.com/vacancy/123'] },
      { durationMs: 0 },
      { maxApplications: -1 },
      { noQuestionnaires: 'false' },
    ]) {
      assert.throws(() =>
        applicationBatchOptions({ ...batchInput, ...change })
      );
    }
    await assert.rejects(f.start({ confirm: false }), {
      code: 'jobs-application-confirmation',
    });
    await f.start({ testMode: true });
    await assert.rejects(f.start({ testMode: true, maxApplications: 1 }), {
      code: 'jobs-application-conflict',
    });
    assert.equal(f.state.opened, 0);
  }
);
