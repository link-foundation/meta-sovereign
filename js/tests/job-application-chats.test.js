import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationChatsFixture,
  untilApplicationChats,
} from '../../experiments/issue-56/application-chats-fixture.mjs';
import { batchInput } from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  applicationBatchKey,
  applicationBatchOptions,
  applicationBatchResult,
  readApplicationBatch,
} from '../src/jobs/application-batch-data.js';
import { createVacancyService } from '../src/jobs/service.js';

const options = { timeout: 15000 };
const gone = (pid) =>
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });

test(
  'chat intent defaults to a separate 120 minute slot and preserves legacy batch signatures',
  options,
  () => {
    const legacy = applicationBatchOptions(batchInput);
    assert.equal(legacy.processChats, undefined);
    const current = applicationBatchOptions({
      ...batchInput,
      processChats: true,
    });
    assert.equal(
      current.processChats,
      true,
      'application-owned chat intent is missing'
    );
    assert.equal(current.chatsIntervalMinutes, 120);
    assert.equal(current.chatBrowserSlot, 'chat-slot');
    assert.equal(current.chatModelDraft, false);
    for (const change of [
      { processChats: 'true' },
      { chatModelDraft: 1 },
      { chatPrefillForms: 1 },
      { chatsIntervalMinutes: 0 },
      { chatsIntervalMinutes: 121 },
      { chatsIntervalMinutes: 1.5 },
      { chatBrowserSlot: 'jobs' },
    ]) {
      assert.throws(
        () => applicationBatchOptions({ ...batchInput, ...change }),
        { code: 'jobs-application-chats-input' }
      );
    }
  }
);

test(
  'a held ordinary chat has an actual child while applications continue, then Stop drains both',
  options,
  async (t) => {
    const f = applicationChatsFixture(t);
    await f.start({ processChats: true, confirmations: ['send'] });
    const receipt = await f.ready();
    const child = receipt.batch.chatWorker;
    assert(child.pid > 0 && child.pid !== process.pid);
    assert.equal(f.calls.preparation[0].options.slot, 'chat-slot');
    assert.equal(f.calls.preparation[0].options.store, f.store);
    assert.equal(f.calls.start[0].polling.intervalMs, 7200000);
    assert.equal(f.calls.start[0].modelDraft, false);
    assert.deepEqual(child.held, {
      chat: f.held.chat,
      title: f.held.title,
      url: f.held.url,
    });
    await f.until((row) => row.application?.continuation?.step === 'send');
    await f.confirm('send');
    const next = await f.until((row) => row.application?.url.endsWith('/456'));
    assert.equal(next.batch.delivered, 1);
    assert.equal(next.batch.chatWorker.pid, child.pid);
    await f.start({ processChats: true, confirmations: ['send'] });
    assert.equal(
      f.calls.children.length,
      1,
      'repeat Start must only recover the batch'
    );
    await untilApplicationChats(
      () => f.calls.logs,
      (rows) =>
        rows.some((row) => row.event === 'application-chats-review-held')
    );
    const stopped = await f.stop();
    assert.equal(stopped.batch.chatWorker.active, false);
    assert.equal(stopped.batch.chatWorker.pid, null);
    assert.equal(f.calls.close, 1);
    assert.equal(f.calls.questionClose, 1);
    gone(child.pid);
    applicationBatchResult(stopped, batchInput);
  }
);

test(
  'completion drains the chat child before the batch drain resolves; recovery never restarts it',
  options,
  async (t) => {
    const f = applicationChatsFixture(t);
    await f.start({
      processChats: true,
      chatModelDraft: true,
      chatsIntervalMinutes: 7,
      confirmations: ['send'],
      maxApplications: 1,
    });
    const receipt = await f.ready();
    const pid = receipt.batch.chatWorker.pid;
    assert.equal(f.calls.start[0].modelDraft, true);
    assert.equal(f.calls.start[0].polling.intervalMs, 420000);
    await f.until((row) => row.application?.continuation?.step === 'send');
    await f.confirm('send');
    await f.service['application-batch-drain']();
    gone(pid);
    const stored = await f.store.get(applicationBatchKey(batchInput).id);
    readApplicationBatch(stored, applicationBatchKey(batchInput));
    assert.equal(stored.chatWorker.phase, 'stopped');
    const recovered = createVacancyService(f.serviceOptions);
    t.after(() => recovered.stop());
    const before = f.calls.children.length;
    const status = await recovered['application-batch-status'](batchInput);
    applicationBatchResult(status, batchInput);
    assert.equal(status.batch.chatWorker.active, false);
    assert.equal(f.calls.children.length, before);
  }
);

test(
  'stopping during slot preparation waits for issued preparation and closes it without starting unread work',
  options,
  async (t) => {
    let release;
    const preparing = new Promise((resolve) => {
      release = resolve;
    });
    const f = applicationChatsFixture(t, { prepare: () => preparing });
    t.after(() => release());
    await f.start({ processChats: true, confirmations: ['send'] });
    await f.until((row) => row.application?.continuation?.step === 'send');
    assert.equal(f.calls.start.length, 0);
    const pid = f.worker().status().pid;
    let done = false;
    const stop = f.stop().then((result) => {
      done = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(done, false);
    release();
    const stopped = await stop;
    assert.equal(stopped.batch.phase, 'stopped');
    assert.equal(f.calls.start.length, 0);
    assert.equal(f.calls.close, 1);
    gone(pid);
  }
);

test(
  'login refusal and an exited child remain visible while the application review survives',
  options,
  async (t) => {
    const f = applicationChatsFixture(t, { chatError: 'login-required' });
    await f.start({ processChats: true, confirmations: ['send'] });
    const refused = await untilApplicationChats(
      f.status,
      (row) => row.batch?.chatWorker?.phase === 'refused'
    );
    assert.equal(refused.batch.chatWorker.code, 'login-required');
    await f.until((row) => row.application?.continuation?.step === 'send');
    const pid = refused.batch.chatWorker.pid;
    process.kill(pid, 'SIGTERM');
    await untilApplicationChats(
      () => f.worker().status(),
      (row) => row.code === 'jobs-application-chats-child-exited'
    );
    const still = await f.status();
    assert.equal(still.application.active, true);
    assert.equal(f.calls.start.length, 0);
    await f.stop();
    gone(pid);
  }
);

test(
  'preview and ordinary status never spawn a chat child, including interrupted recovery',
  options,
  async (t) => {
    const f = applicationChatsFixture(t);
    await f.start({ processChats: true, testMode: true });
    const preview = await f.status();
    assert.equal(preview.batch.chatWorker.phase, 'preview');
    assert.equal(f.calls.children.length, 0);
    applicationBatchResult(preview, batchInput);
    const key = applicationBatchKey(batchInput);
    const record = await f.store.get(key.id);
    const interrupted = {
      ...record,
      active: true,
      phase: 'starting',
      options: {
        ...record.options,
        review: { ...record.options.review, testMode: false },
      },
    };
    interrupted.signature = JSON.stringify(interrupted.options);
    await f.store.put(interrupted);
    const status = await f.status();
    assert.equal(status.batch.phase, 'interrupted');
    assert.equal(status.batch.chatWorker.phase, 'interrupted');
    assert.equal(f.calls.children.length, 0);
  }
);

for (const ending of ['expiry', 'service shutdown']) {
  test(
    `${ending} waits for chat browser closure and child exit`,
    options,
    async (t) => {
      let release;
      let closing = false;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const f = applicationChatsFixture(t, {
        closing: async () => {
          closing = true;
          await gate;
        },
      });
      t.after(() => release());
      await f.start({
        processChats: true,
        durationMs: 60000,
        confirmations: ['send'],
      });
      const receipt = await f.ready();
      const pid = receipt.batch.chatWorker.pid;
      let drain;
      if (ending === 'expiry') {
        f.state.clock += 60001;
        await f.until((row) => row.batch.phase === 'expired');
        drain = f.service['application-batch-drain']();
      } else {
        drain = f.service.stop();
      }
      let done = false;
      const settled = drain.then(() => {
        done = true;
      });
      await untilApplicationChats(() => closing, Boolean);
      assert.equal(done, false);
      release();
      await settled;
      assert.equal(f.calls.close, 1);
      assert.equal(f.calls.questionClose, 1);
      gone(pid);
    }
  );
}
