import test from 'node:test';
import assert from 'node:assert/strict';
import { salaryBatchFixture } from '../../experiments/issue-56/application-salary-batch-fixture.mjs';
import { refuseApplicationDrafts } from '../../experiments/issue-56/application-salary-fixture.mjs';
import {
  batchUrls,
  batchInput,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import { createVacancyService } from '../src/jobs/service.js';
import { applicationBatchResult } from '../src/jobs/application-batch-data.js';
import { createVacancyChoiceService } from '../src/jobs/vacancy-choice-service.js';
import { vacancySnapshot } from '../src/assignments/vacancy.js';
import { vacancySnapshotFixture } from '../../experiments/issue-56/vacancy-fixture.mjs';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';

const limits = { timeout: 6000 };
const atSend = (f, url) =>
  f.until(
    (r) =>
      r.application?.url === url && r.application.continuation?.step === 'send'
  );

test(
  'salary-deferred batch URLs revisit only after the higher tier is exhausted',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t);
    await f.start();
    const high = await atSend(f, batchUrls[1]);
    assert.equal(high.batch.salaryFloorRub, 450000);
    assert.equal(high.batch.salaryDeferred, 1);
    assert.equal(high.batch.salaryTier, 0);
    assert.equal(f.state.submitted, 0);
    await f.confirm('send');
    const lower = await atSend(f, batchUrls[0]);
    assert.equal(lower.batch.salaryFloorRub, 400000);
    assert.equal(lower.batch.salaryTier, 1);
    assert.equal(lower.batch.salaryDeferred, 0);
    assert.equal(lower.batch.cursor, 2);
    assert.equal(lower.application.salaryFloorRub, 400000);
    assert.equal(lower.application.salaryAdmission.action, 'apply');
    assert.equal(lower.batch.settings.salary.currencies[0].net, 450000);
    applicationBatchResult(lower, batchInput);
    const journal = await f.store.get('secret:jobs-application:jobs:123');
    assert.equal(
      journal.options.salaryFloorRub,
      undefined,
      'base policy stays frozen'
    );
    await f.confirm('send');
    const done = await f.until((r) => r.batch.phase === 'completed');
    assert.equal(done.batch.delivered, 2);
    assert.equal(f.state.opened, 3);
    assert.equal(f.state.closed, 3);
    assert.deepEqual((await f.service['application-queue']({})).entries, []);
    assert.deepEqual((await f.service['choices-stored']({})).entries, []);
  }
);

test(
  'successive salary passes retain exact 50000 RUB steps without dispatching early',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t, ['от 300000 ₽']);
    await f.start({ urls: [batchUrls[0]] });
    const eligible = await atSend(f, batchUrls[0]);
    assert.equal(eligible.batch.salaryTier, 3);
    assert.equal(eligible.batch.salaryFloorRub, 300000);
    assert.equal(f.state.opened, 4);
    assert.equal(f.state.submitted, 0);
    await f.confirm('send');
    assert.equal(
      (await f.until((r) => r.batch.phase === 'completed')).batch.delivered,
      1
    );
  }
);

test(
  'salary maxima below half target are counted as exclusions and never queued for lower tiers',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t, ['до 200000 ₽', '']);
    await f.start();
    await atSend(f, batchUrls[1]);
    await f.confirm('send');
    const done = await f.until((r) => r.batch.phase === 'completed');
    assert.equal(done.batch.skipped, 1);
    assert.equal(done.batch.delivered, 1);
    assert.equal(done.batch.salaryTier, 0);
    assert.equal(f.state.opened, 2);
    assert.deepEqual((await f.service['choices-stored']({})).entries, []);
  }
);

test(
  'a replicated permanent owner choice removes a salary deferral before reopening',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t);
    await f.start();
    await atSend(f, batchUrls[1]);
    // Simulate an acknowledged owner choice arriving from another device.
    const owner = createVacancyChoiceService({
      store: f.store,
      run: (work) => work(new AbortController().signal),
    });
    const choices = await owner['choices-stored']({});
    await owner['choice-save']({
      url: batchUrls[0],
      title: 'Owner exclusion',
      state: 'skipped',
      revision: choices.revision,
    });
    await f.confirm('send');
    const done = await f.until((r) => r.batch.phase === 'completed');
    assert.equal(done.batch.skipped, 1);
    assert.equal(done.batch.salaryDeferred, 0);
    assert.equal(done.batch.delivered, 1);
    assert.equal(f.state.opened, 2);
  }
);

const deferCurrentSalary = async (f, receipt) => {
  f.state.fields[1].value = 'Actual salary-deferred owner answer';
  await vacancySnapshot(
    f.store,
    async () => ({ ...vacancySnapshotFixture(), salary: 'от 400000 ₽' }),
    receipt.application.url,
    true
  );
  await f.service['application-read'](applicationIdentity(receipt.application));
};

test(
  'salary-tier reopening restores acknowledged actual questionnaire answers before a separate send confirmation',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t, ['от 600000 ₽', 'от 600000 ₽']);
    await f.start();
    const first = await atSend(f, batchUrls[0]);
    await deferCurrentSalary(f, first);
    await atSend(f, batchUrls[1]);
    const backup = await f.store.get('secret:jobs-application:jobs:123');
    assert.equal(
      backup.draft.fields[0].value,
      'Actual salary-deferred owner answer'
    );
    const qa = await f.store.get('secret:jobs-application-answers:jobs:123');
    assert.equal(qa.draftId, backup.draft.id);
    await f.confirm('send');
    const restored = await atSend(f, batchUrls[0]);
    assert.equal(restored.application.restoration.state, 'restored');
    assert.equal(
      f.state.fields[1].value,
      'Actual salary-deferred owner answer'
    );
    assert.equal(f.state.submitted, 1, 'restoration cannot send');
    await f.confirm('send');
    assert.equal(
      (await f.until((r) => r.batch.phase === 'completed')).batch.delivered,
      2
    );
  }
);

test(
  'a salary preservation refusal keeps actual owner answers open and stops the batch',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t, ['от 600000 ₽']);
    await f.start({ urls: [batchUrls[0]] });
    const first = await atSend(f, batchUrls[0]);
    refuseApplicationDrafts(f.store);
    await deferCurrentSalary(f, first);
    const refused = await f.until((r) => r.batch.phase === 'refused');
    assert.equal(refused.application.active, true);
    assert.equal(refused.batch.salaryTier, 0);
    assert.equal(
      f.state.fields[1].value,
      'Actual salary-deferred owner answer'
    );
    assert.equal(f.state.submitted, 0);
    assert.equal(f.state.closed, 0);
  }
);

test(
  'the confirmed delivery cap ends a batch before salary revisits',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t);
    await f.start({ maxApplications: 1 });
    await atSend(f, batchUrls[1]);
    await f.confirm('send');
    const done = await f.until((r) => r.batch.phase === 'completed');
    assert.equal(done.batch.delivered, 1);
    assert.equal(done.batch.salaryTier, 0);
    assert.equal(done.batch.salaryDeferred, 0);
    assert.equal(f.state.opened, 2);
  }
);

test(
  'worker restart retains salary progress without reconstructing the RAM revisit queue',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t);
    await f.start();
    const high = await atSend(f, batchUrls[1]);
    assert.equal(high.batch.salaryDeferred, 1);
    const key = 'secret:jobs-application-batch:jobs:fixture-batch';
    const saved = await f.store.get(key);
    await f.stop();
    await f.service.stop();
    await f.store.put(saved);
    f.service = createVacancyService(f.serviceOptions);
    const recovered = await f.status();
    assert.equal(recovered.batch.phase, 'interrupted');
    assert.equal(recovered.batch.salaryDeferred, 0);
    assert.equal(recovered.batch.active, false);
    applicationBatchResult(recovered, batchInput);
    assert.equal((await f.start()).batch.phase, 'interrupted');
    assert.equal(f.state.opened, 2);
  }
);

test(
  'salary opt-out and zero-effect preview preserve their existing batch behavior',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t, ['до 200000 ₽']);
    await f.start({ salaryLadder: false, urls: [batchUrls[0]] });
    const review = await atSend(f, batchUrls[0]);
    assert.equal(review.batch.salaryTier, undefined);
    assert.equal(review.application.salaryAdmission, null);
    await f.confirm('send');
    assert.equal(
      (await f.until((r) => r.batch.phase === 'completed')).batch.delivered,
      1
    );
    const preview = salaryBatchFixture(t);
    const receipt = await preview.start({ testMode: true });
    assert.equal(receipt.batch.phase, 'completed');
    assert.equal(receipt.batch.salaryDeferred, 0);
    assert.equal(preview.state.opened, 0);
  }
);

test(
  'batch salary receipts reject invented floors and deferred counts',
  limits,
  async (t) => {
    const f = salaryBatchFixture(t);
    await f.start();
    const receipt = await atSend(f, batchUrls[1]);
    for (const patch of [
      { salaryFloorRub: 1 },
      { salaryTier: 1 },
      { salaryDeferred: 3 },
    ]) {
      const forged = globalThis.structuredClone(receipt);
      Object.assign(forged.batch, patch);
      assert.throws(() => applicationBatchResult(forged, batchInput), {
        code: 'jobs-application-batch-recovery',
      });
    }
  }
);
