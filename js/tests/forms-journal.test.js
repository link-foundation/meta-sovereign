import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import {
  createFormJournal,
  formReportSnapshot,
} from '../src/forms/review-journal.js';
import { formChoiceEnvironment } from './helpers/forms-choice-fixture.mjs';
import { formUploadEnvironment } from './helpers/forms-upload-fixture.mjs';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';

test(
  'review history retains captured pages without clearing live targets or repeating recovered actions',
  { timeout: 5000 },
  async () => {
    const written = [];
    const env = await formChoiceEnvironment({
      reportWriter: async (report) => {
        written.push(globalThis.structuredClone(report));
        return { state: 'saved', path: 'logs/forms/fixture.md' };
      },
    });
    try {
      const first = await env.plan();
      const id = first.reviewSession.id;
      const history = await env.reader.historyReview(id);
      assert.equal(history.checkpoints.length, 1);
      assert(!history.checkpoints[0].report.reviewPlan);
      assert(!history.checkpoints[0].report.reviewSession);
      history.checkpoints[0].report.fields[0].value = 'changed export';
      assert.equal(
        (await env.reader.historyReview(id)).checkpoints[0].report.fields[0]
          .value,
        'hi'
      );
      const opened = await env.disclose(first);
      assert.equal(
        opened.state,
        'opened',
        'history leaves the reviewed target alive'
      );
      assert.equal((await env.disclose(first)).state, 'opened');
      assert.equal(env.clicks, 1);
      assert.equal(
        written.length,
        2,
        'recovery does not duplicate saved action reports'
      );
      const verified = written[1];
      assert.equal(verified.outcome.state, 'opened');
      assert.equal(verified.fields[0].plannedAnswer.source, 'exact');
      assert.equal(
        verified.fields[0].value,
        'hi',
        'proposal remains separate from current answer'
      );
      env.report.url = 'https://example.test/next';
      env.report.title = 'Next page';
      env.field.label = 'Email';
      await env.plan();
      const pages = await env.reader.historyReview(id);
      assert.deepEqual(
        pages.checkpoints.map((entry) => entry.action),
        ['plan', 'disclose', 'plan']
      );
      assert.equal(pages.checkpoints[0].report.title, 'Choices');
      assert.equal(pages.checkpoints[2].report.title, 'Next page');
      assert.equal(pages.scope, 'captured-checkpoints');
      await env.reader.closeReview(id);
      await assert.rejects(env.reader.historyReview(id), {
        code: 'form-session-missing',
      });
    } finally {
      await env.reader.stop();
    }
  }
);

test('bounded history counts evicted and oversized captures and releases caller references', () => {
  const journal = createFormJournal({ maxCheckpoints: 2, maxBytes: 2048 });
  const snapshot = (value) => ({
    mode: 'read-only',
    title: value,
    fields: [{ id: 'f', value }],
  });
  for (const value of ['first', 'second', 'third']) {
    journal.capture('read', snapshot(value));
  }
  const large = snapshot('x'.repeat(2100));
  journal.capture('read', large);
  assert.equal(journal.capture('read', large), false);
  const report = journal.read();
  assert.equal(report.coverage, 'partial');
  assert.equal(report.omittedCheckpoints, 2);
  assert.deepEqual(
    report.checkpoints.map((entry) => entry.sequence),
    [2, 3]
  );
  assert.throws(() => createFormJournal({ maxBytes: Infinity }), /finite/);
  assert.throws(() => createFormJournal({ maxCheckpoints: 0 }), /finite/);
  const byteLimited = createFormJournal({
    maxCheckpoints: 100,
    maxBytes: 1024,
  });
  byteLimited.capture('read', snapshot('a'.repeat(300)));
  byteLimited.capture('read', snapshot('b'.repeat(300)));
  assert.equal(byteLimited.read().checkpoints.length, 1);
  assert.equal(byteLimited.read().omittedCheckpoints, 1);
});

test('an unavailable post-action readback is labelled as the previous snapshot', () => {
  const proposed = {
    mode: 'answer-plan',
    fields: [
      {
        id: 'f',
        label: 'Email',
        type: 'email',
        frame: 'frame-1',
        answer: { source: 'profile', text: 'ada@example.test' },
      },
    ],
    reviewSession: { id: 'private' },
    reviewPlan: { id: 'consumed' },
  };
  const snapshot = formReportSnapshot(
    {
      mode: 'application-result',
      state: 'uncertain',
      code: 'form-apply-unknown',
      planId: 'consumed',
    },
    proposed
  );
  assert.equal(snapshot.observation, 'last-reviewed-snapshot');
  assert.equal(snapshot.outcome.state, 'uncertain');
  assert.equal(snapshot.fields[0].plannedAnswer.text, 'ada@example.test');
  assert(!snapshot.reviewPlan && !snapshot.reviewSession);
});

test(
  'failed report persistence preserves confirmed attachment receipts and recovered outcomes',
  { timeout: 5000 },
  async () => {
    let attempts = 0;
    const env = await formUploadEnvironment({
      reportWriter: async () => {
        attempts++;
        throw new Error('disk unavailable');
      },
    });
    try {
      const plan = await env.plan();
      assert.equal(plan.reportFile.state, 'failed');
      const attached = await env.attach(plan);
      assert.equal(attached.state, 'attached');
      assert.equal(attached.reportFile.code, 'form-report-write');
      assert.equal((await env.attach(plan)).state, 'attached');
      assert.equal(attempts, 2);
      assert.equal(env.writes, 1);
      const journal = await env.reader.historyReview(plan.reviewSession.id);
      assert.equal(journal.checkpoints[1].report.outcome.state, 'attached');
      assert(!JSON.stringify(journal).includes(env.file.data));
    } finally {
      await env.reader.stop();
    }
  }
);

test(
  'review shutdown waits for a pending report write acknowledgement',
  { timeout: 5000 },
  async () => {
    let started;
    let finish;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const held = new Promise((resolve) => {
      finish = resolve;
    });
    const env = await formChoiceEnvironment({
      reportWriter: async () => {
        started();
        await held;
        return { state: 'saved', path: 'fixture.md' };
      },
    });
    const pending = assert.rejects(env.plan(), { code: 'form-session-closed' });
    await ready;
    let stopped = false;
    const stopping = env.reader.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopped, false);
    finish();
    await Promise.all([pending, stopping]);
  }
);

test(
  'history transport supports text and binary Lino, refuses foreign origins and closed owners',
  { timeout: 15000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await formChoiceEnvironment({ reportWriter: null });
      await env.reader.stop();
      const http = await formReviewHttp(env.options, media);
      try {
        const { session } = await http.post('open', { url: env.report.url });
        await http.post('plan', { id: session.id, profileId: env.profile.id });
        const history = await http.post('history', { id: session.id });
        assert.equal(history.mode, 'review-journal');
        assert.equal(history.checkpoints.length, 1);
        assert.equal(
          (
            await http.post(
              'history',
              { id: session.id },
              { origin: 'https://foreign.test' }
            )
          ).ok,
          false
        );
        await http.post('close', { id: session.id });
        assert.equal(
          (await http.post('history', { id: session.id })).code,
          'form-session-missing'
        );
      } finally {
        await http.server.close();
      }
    }
  }
);
