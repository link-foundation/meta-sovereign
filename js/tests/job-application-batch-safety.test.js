import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  applicationBatchFixture,
  batchUrls,
  batchInput,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  applicationBatchKey,
  applicationBatchResult,
  readApplicationBatch,
} from '../src/jobs/application-batch-data.js';

const options = { timeout: 5000 };
test(
  'automatic queue revisits restore actual owner answers into fresh empty fields',
  options,
  async (t) => {
    const f = applicationBatchFixture(t, {
      form: (state) => {
        if (state.documents === 1) {
          state.fields[1].value = 'Actual owner answer';
        }
      },
    });
    await f.start({
      urls: [batchUrls[0]],
      noQuestionnaires: true,
      confirmations: ['send'],
    });
    await f.until((r) => r.batch.phase === 'questionnaires-held');
    f.service['application-signal-mode']({
      url: batchUrls[0],
      noQuestionnaires: false,
    });
    const reopened = await f.until(
      (r) => r.application?.continuation?.step === 'send'
    );
    assert.equal(reopened.application.restoration.state, 'restored');
    assert.equal(f.state.fields[1].value, 'Actual owner answer');
    assert.equal(f.state.submitted, 0);
    await f.confirm('send');
    assert.equal(
      (await f.until((r) => r.batch.phase === 'completed')).batch.delivered,
      1
    );
  }
);
test(
  'fresh owner edits on a queued revisit remain protected and stop automatic Send',
  options,
  async (t) => {
    const f = applicationBatchFixture(t, {
      form: (state) => {
        state.fields[1].value =
          state.documents === 1 ? 'Backed answer' : 'Fresh owner edit';
      },
    });
    await f.start({ urls: [batchUrls[0]], noQuestionnaires: true });
    await f.until((r) => r.batch.phase === 'questionnaires-held');
    f.service['application-signal-mode']({
      url: batchUrls[0],
      noQuestionnaires: false,
    });
    await f.until((r) => r.batch.phase === 'refused');
    assert.equal(f.state.fields[1].value, 'Fresh owner edit');
    assert.equal(f.state.submitted, 0);
    assert.equal(f.state.closed, 1, 'reopened owner form remains open');
  }
);
test(
  'automatic generic-error revisit retains its five-hour deadline and releases only verified rejection',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    f.state.genericErrors = 1;
    await f.start({ urls: [batchUrls[0]] });
    const waiting = await f.until((r) => r.batch.phase === 'retry-wait');
    assert.equal(waiting.batch.delivered, 0);
    assert.equal(f.state.submitted, 1);
    const before = f.state.opened;
    await delay(10);
    assert.equal(f.state.opened, before);
    f.state.clock = Date.parse(waiting.batch.nextAt);
    const result = await f.until((r) => r.batch.phase === 'completed');
    assert.equal(result.batch.delivered, 1);
    assert.equal(f.state.submitted, 2);
    assert.equal(f.state.opened, 2);
  }
);
test(
  'saved exclusions added while queued prevent automatic reopening',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ urls: [batchUrls[0]], noQuestionnaires: true });
    await f.until((r) => r.batch.phase === 'questionnaires-held');
    const choices = await f.service['choices-stored']({});
    await f.service['choice-save']({
      url: batchUrls[0],
      title: 'Keep excluded',
      state: 'skipped',
      revision: choices.revision,
    });
    f.service['application-signal-mode']({
      url: batchUrls[0],
      noQuestionnaires: false,
    });
    const result = await f.until((r) => r.batch.phase === 'completed');
    assert.equal(result.batch.skipped, 1);
    assert.equal(result.batch.delivered, 0);
    assert.equal(f.state.opened, 1);
    assert.equal((await f.service['application-queue']({})).entries.length, 0);
  }
);
test(
  'a batch explicitly owns one daily-limit wait and resumes through protected restoration and Send confirmation',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ urls: [batchUrls[0]], confirmations: ['send'] });
    await f.until((r) => r.application?.continuation?.step === 'send');
    const displayed = await f.status();
    f.state.fields[1].value = 'Answer before limit';
    const reviewed = await f.service['application-read'](displayed.application);
    await f.service['application-continue'](reviewed);
    f.state.dailyLimits = 1;
    await f.confirm('send');
    const waiting = await f.until(
      (r) => r.application?.limitWait?.phase === 'waiting'
    );
    assert.equal(waiting.application.delivery, 'unknown');
    assert.equal(waiting.batch.delivered, 0);
    f.state.clock = Date.parse(waiting.application.limitWait.until);
    const restored = await f.until(
      (r) =>
        r.application?.continuation?.step === 'send' &&
        r.application.restoration?.state === 'restored'
    );
    assert.equal(restored.application.attempted.submit, false);
    assert.equal(f.state.fields[1].value, 'Answer before limit');
    assert.equal(f.state.refreshes, 1);
    assert.equal(f.state.submitted, 1);
    await f.confirm('send');
    assert.equal(
      (await f.until((r) => r.batch.phase === 'completed')).batch.delivered,
      1
    );
    assert.equal(f.state.submitted, 2);
  }
);
test(
  'repeated witnessed daily limits receive separate owned waits without bypassing Send confirmation',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ urls: [batchUrls[0]], confirmations: ['send'] });
    await f.until((r) => r.application?.continuation?.step === 'send');
    const ids = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      f.state.dailyLimits = 1;
      await f.confirm('send');
      const waiting = await f.until(
        (r) => r.application?.limitWait?.phase === 'waiting'
      );
      ids.push(waiting.application.limitWait.id);
      f.state.clock = Date.parse(waiting.application.limitWait.until);
      await f.until(
        (r) =>
          r.application?.continuation?.step === 'send' &&
          r.application.restoration?.state === 'restored' &&
          !r.application.hold
      );
      assert.equal(f.state.submitted, attempt + 1);
    }
    assert.equal(new Set(ids).size, 2);
    await f.confirm('send');
    assert.equal(
      (await f.until((r) => r.batch.phase === 'completed')).batch.delivered,
      1
    );
    assert.equal(f.state.refreshes, 2);
  }
);
test(
  'a finite lifetime cancels an in-flight review delay before any Send reservation',
  options,
  async (t) => {
    let began;
    const pending = new Promise((resolve) => {
      began = resolve;
    });
    const f = applicationBatchFixture(t, {
      application: {
        trace: (event) => {
          if (event.event === 'application-review-delay') {
            began();
          }
        },
      },
    });
    await f.start({
      urls: [batchUrls[0]],
      autoExact: true,
      reviewDelayMs: 30000,
      durationMs: 1000,
    });
    await pending;
    const receipt = await f.until((r) => r.batch.phase === 'expired');
    assert.equal(receipt.application.attempted.submit, false);
    assert.equal(f.state.submitted, 0);
    assert.equal(f.state.closed, 0);
  }
);
test(
  'stopping a daily-limit batch drains only its owned wait and retains the form',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    f.state.dailyLimits = 1;
    await f.start({ urls: [batchUrls[0]] });
    await f.until((r) => r.application?.limitWait?.phase === 'waiting');
    const stopped = await f.stop();
    assert.equal(stopped.application.limitWait.phase, 'stopped');
    assert.equal(stopped.application.active, true);
    assert.equal(f.state.refreshes ?? 0, 0);
    assert.equal(f.state.closed, 0);
  }
);
test(
  'finite expiry keeps the current pending form and cannot restart through status',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    await f.start({ durationMs: 1000, confirmations: ['send'] });
    const result = await f.until((r) => r.batch.phase === 'expired');
    assert.equal(result.application.active, true);
    assert.equal(f.state.closed, 0);
    assert.equal(f.state.submitted, 0);
    await delay(10);
    assert.equal((await f.status()).batch.phase, 'expired');
  }
);
test(
  'tampered public and private lifecycle receipts refuse recovery',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    const receipt = await f.start({ testMode: true });
    const reordered = {
      ...receipt,
      batch: {
        ...receipt.batch,
        settings: Object.fromEntries(
          Object.entries(receipt.batch.settings).reverse()
        ),
      },
    };
    assert.equal(applicationBatchResult(reordered, batchInput), reordered);
    const key = applicationBatchKey(batchInput);
    const saved = await f.store.get(key.id);
    for (const change of [
      { revision: 'not-a-revision' },
      { nextAt: 3 },
      { phase: 'completed', active: true },
      { expiresAt: saved.startedAt },
      { skipped: [batchUrls[0]], delivered: [batchUrls[0]] },
    ]) {
      assert.throws(() => readApplicationBatch({ ...saved, ...change }, key));
    }
    for (const change of [
      { revision: '' },
      { active: true },
      { total: 0 },
      { delivered: 2, skipped: 1 },
      { nextAt: 'yesterday' },
      { settings: { ...receipt.batch.settings, confirmations: ['typo'] } },
    ]) {
      assert.throws(() =>
        applicationBatchResult(
          { ...receipt, batch: { ...receipt.batch, ...change } },
          batchInput
        )
      );
    }
    assert.throws(() =>
      applicationBatchResult(receipt, { browserSlot: 'foreign' })
    );
  }
);
test(
  'SIGUSR1 interrupts an in-flight exact-answer delay and retains the batch queue',
  options,
  async (t) => {
    let began;
    const pending = new Promise((resolve) => {
      began = resolve;
    });
    const f = applicationBatchFixture(t, {
      application: {
        trace: (event) => {
          if (event.event === 'application-review-delay') {
            began();
          }
        },
      },
    });
    await f.start({
      urls: [batchUrls[0]],
      autoExact: true,
      reviewDelayMs: 100,
    });
    await pending;
    f.service['application-signal-mode']({
      url: batchUrls[0],
      noQuestionnaires: true,
    });
    await f.until((r) => r.batch.phase === 'questionnaires-held');
    assert.equal(f.state.submitted, 0);
    assert.equal(f.state.closed, 1);
    assert.equal((await f.service['application-queue']({})).entries.length, 1);
  }
);
test(
  'Stop cancels an in-flight delay before reservation and retains the current form',
  options,
  async (t) => {
    let began;
    const pending = new Promise((resolve) => {
      began = resolve;
    });
    const f = applicationBatchFixture(t, {
      application: {
        trace: (event) => {
          if (event.event === 'application-review-delay') {
            began();
          }
        },
      },
    });
    await f.start({ autoExact: true, reviewDelayMs: 100 });
    await pending;
    const result = await f.stop();
    assert.equal(result.batch.phase, 'stopped');
    assert.equal(result.application.attempted.submit, false);
    assert.equal(f.state.submitted, 0);
    assert.equal(f.state.closed, 0);
  }
);
test(
  'failed questionnaire backup refuses the batch and leaves the owner form open',
  options,
  async (t) => {
    const f = applicationBatchFixture(t);
    const put = f.store.put.bind(f.store);
    f.store.put = async (row) => {
      if (row.id.startsWith('secret:jobs-application:') && row.draft) {
        throw Object.assign(new Error('Backup refused'), {
          code: 'fixture-backup-refused',
        });
      }
      return put(row);
    };
    await f.start({ noQuestionnaires: true });
    const result = await f.until((r) => r.batch.phase === 'refused');
    assert.equal(result.batch.code, 'fixture-backup-refused');
    assert.equal(result.application.active, true);
    assert.equal(f.state.closed, 0);
    assert.equal(f.state.submitted, 0);
    assert.equal((await f.service['application-queue']({})).entries.length, 0);
  }
);
