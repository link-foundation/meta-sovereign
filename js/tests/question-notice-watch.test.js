import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import { listOutbox, recoverOutbox } from '../src/automation/outbox.js';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import { newBrowserWatchId } from '../src/automation/question-browser-watch.js';
import { noticeReplyDraft } from '../src/automation/question-notice-delivery.js';
import { questionChoiceKey } from '../src/automation/question-choice-key.js';
import {
  checkNoticeWatch,
  noticeSnapshot,
  rejectionText,
} from '../../experiments/issue-56/notice-policy-fixture.mjs';
import { questionWatchGate } from '../../experiments/issue-56/question-watch-fixture.mjs';
import {
  noticeText,
  noticeReply,
} from '../../experiments/issue-56/notice-fixture.mjs';

const acknowledgement = { acknowledgements: 'reply' };
const rejection = { rejections: 'reply', rejectionReply: 'May I ask why?' };

test('notice mode is explicit, inactive and default-review, with independent saved policies', () =>
  checkNoticeWatch({}, async (env) => {
    env.state.active = true;
    await env.browser.watchStart(env.input);
    await env.until((s) => s.phase === 'owner-active');
    assert.equal(env.state.histories, 0);
    assert.deepEqual(env.state.sends, []);
    env.state.active = false;
    await env.until((s) => s.phase === 'review');
    assert.deepEqual(env.state.sends, []);
    await saveAnswerPolicy(env.store, { notices: acknowledgement });
    const sent = await env.until((s) => s.phase === 'sent');
    assert.equal(sent.selection.type, 'text');
    assert.equal(sent.outbox.receipt.text, noticeReply);
    await delay(20);
    assert.deepEqual(env.state.sends, [noticeReply]);
  }));

test('acknowledgements reserve the shared question key before issue and allow a later distinct notice', () =>
  checkNoticeWatch(
    {
      notices: acknowledgement,
      issue: async (text, state) => {
        const records = await listOutbox(state.store);
        assert.equal(
          records.filter((row) => row.status === 'sending').length,
          1
        );
        return {
          via: 'browser',
          source: 'hh',
          chat: '7',
          text,
          messageId: '102',
        };
      },
    },
    async (env) => {
      env.state.store = env.store;
      let flushes = 0;
      env.store.flush = async () => {
        flushes++;
      };
      await env.browser.watchStart(env.input);
      const sent = await env.until((s) => s.phase === 'sent');
      const draft = noticeReplyDraft(env.review.target, env.state.snapshot, {
        text: noticeReply,
        message: '101',
      });
      assert.equal(sent.selection.key, questionChoiceKey(draft));
      assert.equal(flushes, 1);
      env.state.rows.push(
        { id: '102', body: noticeReply, outgoing: true },
        { id: '103', body: noticeText, outgoing: false }
      );
      env.state.snapshot = noticeSnapshot(env.state.rows);
      await env.until(
        (s) => s.selection?.key !== sent.selection.key && s.phase === 'sent'
      );
      assert.deepEqual(env.state.sends, [noticeReply, noticeReply]);
    }
  ));

test('rejections reserve chat and message, retain full receipts and never repeat after new wording or text', () =>
  checkNoticeWatch({ body: rejectionText, notices: rejection }, async (env) => {
    let flushes = 0;
    env.store.flush = async () => {
      flushes++;
    };
    await env.browser.watchStart(env.input);
    const sent = await env.until((s) => s.phase === 'sent');
    assert.equal(flushes, 2);
    const records = await listOutbox(env.store);
    assert.deepEqual(records.map((row) => row.kind).sort(), [
      'question-rejection',
      'question-text',
    ]);
    assert.equal(
      records.every((row) => row.receipt.text === rejection.rejectionReply),
      true
    );
    await saveAnswerPolicy(env.store, {
      notices: { ...rejection, rejectionReply: 'Another configured reply.' },
    });
    env.state.rows.at(-1).id = '103';
    env.state.snapshot = noticeSnapshot(env.state.rows);
    const retained = await env.until(
      (s) => s.last?.snapshot.question.id === '103' && s.phase === 'sent'
    );
    assert.equal(retained.selection.key, sent.selection.key);
    assert.equal(retained.selection.text, rejection.rejectionReply);
    assert.deepEqual(env.state.sends, [rejection.rejectionReply]);
  }));

test('missing receipts hold both rejection reservations and repeated start or restart never resumes', () =>
  checkNoticeWatch(
    {
      body: rejectionText,
      notices: rejection,
      issue: async () => ({ via: 'browser' }),
    },
    async (env) => {
      await env.browser.watchStart(env.input);
      const paused = await env.until((s) => s.phase === 'unknown' && !s.owned);
      assert.equal(paused.outbox.status, 'unknown');
      assert.equal(
        (await listOutbox(env.store)).every((row) => row.status === 'unknown'),
        true
      );
      assert.equal((await env.browser.watchStart(env.input)).state, 'paused');
      await recoverOutbox(env.store);
      const restarted = createQuestionBrowser(env);
      try {
        assert.equal((await restarted.watchStart(env.input)).phase, 'unknown');
        assert.equal(env.state.opens, 1);
        assert.deepEqual(env.state.sends, [rejection.rejectionReply]);
      } finally {
        await restarted.close();
      }
    }
  ));

test('queued policy changes refuse before issue and release the owned handle', () => {
  const queued = questionWatchGate();
  const release = questionWatchGate();
  return checkNoticeWatch(
    {
      notices: acknowledgement,
      queued: async () => {
        queued.release();
        await release.promise;
      },
    },
    async (env) => {
      try {
        await env.browser.watchStart(env.input);
        await queued.promise;
        await saveAnswerPolicy(env.store, {
          notices: { acknowledgements: 'review' },
        });
        release.release();
        const paused = await env.until((s) => s.state === 'paused' && !s.owned);
        assert.equal(paused.reason, 'question-watch-plan-changed');
        assert.deepEqual(env.state.sends, []);
        assert.equal(env.state.closes, 1);
      } finally {
        release.release();
      }
    }
  );
});

test('failed reservation flush cannot issue a rejection', () =>
  checkNoticeWatch({ body: rejectionText, notices: rejection }, async (env) => {
    env.store.flush = async () => {
      throw new Error('Synthetic flush failure');
    };
    await env.browser.watchStart(env.input);
    const paused = await env.until((s) => s.state === 'paused' && !s.owned);
    assert.equal(paused.reason, 'outbox-unavailable');
    assert.deepEqual(env.state.sends, []);
  }));

test('stop aborts a history traversal, drains it and admits no reply', () => {
  const entered = questionWatchGate();
  const release = questionWatchGate();
  let signal;
  return checkNoticeWatch(
    {
      notices: acknowledgement,
      history: async (input) => {
        signal = input.signal;
        entered.release();
        await release.promise;
      },
    },
    async (env) => {
      try {
        await env.browser.watchStart(env.input);
        await entered.promise;
        const aborted = new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
        const stopping = env.browser.watchStop(env.input);
        await aborted;
        assert.equal(signal.aborted, true);
        release.release();
        const stopped = await stopping;
        assert.equal(stopped.state, 'stopped');
        assert.equal(stopped.owned, false);
        assert.deepEqual(env.state.sends, []);
      } finally {
        release.release();
      }
    }
  );
});

test('stop drains an issued notice and retains its positive receipt without dispatching twice', () => {
  const entered = questionWatchGate();
  const release = questionWatchGate();
  return checkNoticeWatch(
    {
      notices: acknowledgement,
      issue: async (text) => {
        entered.release();
        await release.promise;
        return {
          via: 'browser',
          source: 'hh',
          chat: '7',
          text,
          messageId: '102',
        };
      },
    },
    async (env) => {
      try {
        await env.browser.watchStart(env.input);
        await entered.promise;
        let settled = false;
        const stopping = env.browser.watchStop(env.input).then((value) => {
          settled = true;
          return value;
        });
        await Promise.resolve();
        assert.equal(settled, false);
        release.release();
        const stopped = await stopping;
        assert.equal(stopped.state, 'stopped');
        assert.equal(stopped.outbox.receipt.text, noticeReply);
        assert.equal(stopped.owned, false);
        assert.deepEqual(env.state.sends, [noticeReply]);
      } finally {
        release.release();
      }
    }
  );
});

test('same-source starts remain single flight and finite expiry releases the notice owner', () =>
  checkNoticeWatch({ notices: acknowledgement }, async (env) => {
    await env.browser.watchStart({ ...env.input, durationMs: 1000 });
    await assert.rejects(
      env.browser.watchStart({ ...env.input, id: newBrowserWatchId() }),
      { code: 'question-watch-busy' }
    );
    await env.until((s) => s.phase === 'sent');
    env.state.now = new Date(env.state.now.getTime() + 1001);
    assert.equal(
      (await env.until((s) => s.state === 'stopped' && !s.owned)).reason,
      'expired'
    );
    assert.equal(env.state.closes, 1);
  }));
