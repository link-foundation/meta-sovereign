import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import { newBrowserWatchId } from '../src/automation/question-browser-watch.js';
import { saveAnswerRule } from '../src/automation/question-store.js';
import {
  questionWatchFixture,
  questionWatchGate,
} from '../../experiments/issue-56/question-watch-fixture.mjs';
import { summaryChoiceMessage } from '../../experiments/issue-56/summary-choice-fixture.mjs';

test('watch start requires an exact reviewed page, real capability and explicit confirmation', async () => {
  const env = await questionWatchFixture();
  try {
    await assert.rejects(
      env.browser.watchStart({ ...env.input, confirm: 'true' }),
      { code: 'question-watch-confirm-required' }
    );
    for (const durationMs of [0, 999, 7200001, NaN]) {
      await assert.rejects(
        env.browser.watchStart({ ...env.input, durationMs }),
        { code: 'question-watch-unavailable' }
      );
    }
    assert.equal(env.state.opens, 0);
    env.state.snapshot.question.body += ' Changed?';
    await assert.rejects(env.browser.watchStart(env.input), {
      code: 'question-watch-page-changed',
    });
    assert.equal(env.state.closes, 1);
    assert.equal(env.state.sends.length, 0);
  } finally {
    await env.browser.close();
  }
});

test('delayed/disabled native choices stay pending and exactly one positive selection survives repeated requests', async () => {
  const env = await questionWatchFixture();
  env.state.snapshot.answerOptions = [];
  const review = await env.browser.inspect(env.review.target);
  env.input.review = review.id;
  try {
    await env.browser.watchStart(env.input);
    await env.until((s) => s.phase === 'pending-options');
    assert.equal(env.state.sends.length, 0);
    assert.equal(env.state.prefills.length, 0);
    await env.browser.watchStart(env.input);
    await assert.rejects(
      env.browser.watchStart({ ...env.input, id: newBrowserWatchId() }),
      { code: 'question-watch-busy' }
    );
    assert.equal(env.state.opens, 1);
    env.state.snapshot.answerOptions = ['Yes', 'No'];
    const sent = await env.until((s) => s.phase === 'sent');
    assert.equal(sent.outbox.receipt.messageId, '102');
    assert.equal(sent.selection.option, 'Yes');
    assert.equal(env.state.sends[0].automated, true);
    await delay(20);
    assert.equal(env.state.sends.length, 1);
    const stopped = await env.browser.watchStop(env.input);
    assert.equal(stopped.state, 'stopped');
    assert.equal(stopped.owned, false);
    assert.equal(env.state.closes, 1);
    assert.equal((await env.browser.watchStart(env.input)).state, 'stopped');
    assert.equal(env.state.opens, 1);
  } finally {
    await env.browser.close();
  }
});

test('owner drafts and unapproved/approximate answers never cause an automatic action', async () => {
  const env = await questionWatchFixture();
  env.state.snapshot.hasDraft = true;
  const review = await env.browser.inspect(env.review.target);
  env.input.review = review.id;
  try {
    await env.browser.watchStart(env.input);
    await env.until((s) => s.phase === 'owner-draft');
    assert.equal(env.state.sends.length, 0);
    await saveAnswerRule(env.store, {
      id: 'experience',
      question: env.state.snapshot.question.body,
      answers: [{ text: 'Yes', approved: false }],
    });
    env.state.snapshot.hasDraft = false;
    await env.until((s) => s.phase === 'review');
    assert.equal(env.state.sends.length, 0);
    assert.equal(env.state.prefills.length, 0);
  } finally {
    await env.browser.close();
  }
});

test('a new incoming question can use one accepted summary; conflicts stay manual', async () => {
  const env = await questionWatchFixture();
  await env.store.delete('qa-rule:experience');
  await env.store.put(
    summaryChoiceMessage({
      body: `Your answers:\n${env.state.snapshot.question.body}: Yes.`,
    })
  );
  await env.store.put(
    summaryChoiceMessage({
      id: 'msg:vk:accepted:21',
      source: 'vk',
      body: `Your answers:\n${env.state.snapshot.question.body}: No.`,
    })
  );
  try {
    await env.browser.watchStart(env.input);
    await env.until((s) => s.last?.plan?.acceptedSummary?.state === 'conflict');
    assert.equal(env.state.sends.length, 0);
    await env.store.delete('msg:vk:accepted:21');
    const sent = await env.until((s) => s.phase === 'sent');
    assert.equal(sent.last.plan.match, 'accepted-summary');
    assert.equal(env.state.sends.length, 1);
    env.state.snapshot.question = {
      id: '103',
      body: 'A completely unknown question?',
      outgoing: false,
    };
    await env.until((s) => s.phase === 'review');
    assert.equal(env.state.sends.length, 1);
  } finally {
    await env.browser.close();
  }
});

test('free text is prefilled once and never sent', async () => {
  const env = await questionWatchFixture();
  env.state.snapshot.strictOptions = false;
  env.state.snapshot.answerOptions = [];
  env.input.review = (await env.browser.inspect(env.review.target)).id;
  try {
    await env.browser.watchStart(env.input);
    await env.until((s) => s.phase === 'owner-draft');
    assert.equal(env.state.prefills.length, 1);
    assert.equal(env.state.prefills[0].text, 'Yes');
    assert.equal(env.state.sends.length, 0);
  } finally {
    await env.browser.close();
  }
});

test('changing answer knowledge during a queued selection refuses before dispatch', async () => {
  const gate = questionWatchGate();
  const entered = questionWatchGate();
  const env = await questionWatchFixture({
    selecting: async () => {
      entered.release();
      await gate.promise;
    },
  });
  try {
    await env.browser.watchStart(env.input);
    await entered.promise;
    await env.store.delete('qa-rule:experience');
    gate.release();
    const paused = await env.until((s) => s.state === 'paused');
    assert.equal(paused.reason, 'question-watch-plan-changed');
    assert.equal(paused.outbox.status, 'failed');
    assert.equal(env.state.sends.length, 0);
  } finally {
    gate.release();
    await env.browser.close();
  }
});

test('missing native receipt pauses and recovery/repeated start never opens or selects again', async () => {
  const env = await questionWatchFixture({
    send: async () => ({ via: 'browser' }),
  });
  try {
    await env.browser.watchStart(env.input);
    const paused = await env.until((s) => s.state === 'paused' && !s.owned);
    assert.equal(paused.phase, 'unknown');
    assert.equal(paused.outbox.status, 'unknown');
    const restarted = createQuestionBrowser(env);
    try {
      assert.equal((await restarted.watchStatus(env.input)).phase, 'unknown');
      assert.equal((await restarted.watchStart(env.input)).state, 'paused');
      assert.equal(env.state.opens, 1);
      assert.equal(env.state.sends.length, 1);
    } finally {
      await restarted.close();
    }
  } finally {
    await env.browser.close();
  }
});

test('page navigation pauses without reopening; saved active records recover as paused', async () => {
  let changed = false;
  const env = await questionWatchFixture({
    reading: async () => {
      if (changed) {
        throw Object.assign(new Error('Changed'), {
          code: 'question-watch-page-changed',
        });
      }
    },
  });
  try {
    await env.browser.watchStart(env.input);
    await env.until((s) => s.phase === 'sent');
    changed = true;
    await env.until((s) => s.state === 'paused' && !s.owned);
    assert.equal(env.state.opens, 1);
    const saved = await env.store.get(env.input.id);
    const stopped = await env.browser.watchStop(env.input);
    assert.equal(stopped.state, 'stopped');
    assert.equal(stopped.reason, 'owner-stopped');
    assert.equal(stopped.owned, false);
    await env.store.put({ ...saved, state: 'active' });
    const recovered = await env.browser.watchStop(env.input);
    assert.equal(recovered.state, 'paused');
    assert.equal(recovered.reason, 'owner-unavailable');
    assert.equal(env.state.opens, 1);
  } finally {
    await env.browser.close();
  }
});

test('stop waits for a dispatched selection and retains its positive receipt without a second action', async () => {
  const gate = questionWatchGate();
  const sent = questionWatchGate();
  const env = await questionWatchFixture({
    send: async (draft) => {
      sent.release();
      await gate.promise;
      return {
        via: 'browser',
        source: draft.source,
        chat: draft.chat,
        option: draft.text,
        messageId: '102',
      };
    },
  });
  try {
    await env.browser.watchStart(env.input);
    await sent.promise;
    let stopped = false;
    const stopping = env.browser.watchStop(env.input).then((s) => {
      stopped = true;
      return s;
    });
    await Promise.resolve();
    assert.equal(stopped, false);
    gate.release();
    const result = await stopping;
    assert.equal(result.outbox.status, 'sent');
    assert.equal(result.state, 'stopped');
    assert.equal(result.owned, false);
    assert.equal(env.state.closes, 1);
    assert.equal(env.state.sends.length, 1);
  } finally {
    gate.release();
    await env.browser.close();
  }
});

test('shutdown drains an opening watch, blocks its writes and releases its handle once', async () => {
  const gate = questionWatchGate();
  const entered = questionWatchGate();
  const env = await questionWatchFixture({
    opening: async () => {
      entered.release();
      await gate.promise;
    },
  });
  const starting = env.browser.watchStart(env.input);
  const failedStart = assert.rejects(starting, {
    code: 'question-watch-stopped',
  });
  await entered.promise;
  const closing = env.browser.close();
  gate.release();
  await Promise.all([closing, failedStart]);
  assert.equal(env.state.closes, 1);
  assert.equal(env.state.sends.length, 0);
  await assert.rejects(env.browser.watchStart(env.input), {
    code: 'question-browser-closed',
  });
});

test('expired watches release the provider and never renew through status', async () => {
  const env = await questionWatchFixture();
  try {
    await env.browser.watchStart({ ...env.input, durationMs: 1000 });
    await env.until((s) => s.phase === 'sent');
    env.state.now = new Date(env.state.now.getTime() + 1001);
    const stopped = await env.until((s) => s.state === 'stopped' && !s.owned);
    assert.equal(stopped.reason, 'expired');
    assert.equal(env.state.closes, 1);
    assert.equal(env.state.sends.length, 1);
  } finally {
    await env.browser.close();
  }
});

test('status recovers an outbox receipt committed after the watcher intent without resuming', async () => {
  const env = await questionWatchFixture();
  try {
    await env.browser.watchStart(env.input);
    const sent = await env.until((s) => s.phase === 'sent');
    await env.browser.watchStop(env.input);
    const saved = await env.store.get(env.input.id);
    await env.store.put({
      ...saved,
      state: 'active',
      phase: 'selecting',
      outbox: undefined,
    });
    const recovered = await env.browser.watchStatus(env.input);
    assert.equal(recovered.state, 'paused');
    assert.equal(recovered.reason, 'owner-unavailable');
    assert.equal(recovered.phase, 'sent');
    assert.deepEqual(recovered.outbox.receipt, sent.outbox.receipt);
    assert.equal(env.state.opens, 1);
    assert.equal(env.state.sends.length, 1);
  } finally {
    await env.browser.close();
  }
});

test('failed watcher persistence releases ownership and never dispatches or keeps polling', async () => {
  const env = await questionWatchFixture();
  const original = env.store.put;
  let refused = 0;
  env.store.put = async (value) => {
    if (value.kind === 'question-browser-watch' && value.phase !== 'starting') {
      refused++;
      throw new Error('Synthetic watcher persistence failure');
    }
    return original(value);
  };
  try {
    await env.browser.watchStart(env.input);
    await env.until((s) => !s.owned);
    assert.equal(env.state.closes, 1);
    assert.equal(env.state.sends.length, 0);
    const count = refused;
    await delay(20);
    assert.equal(refused, count);
  } finally {
    env.store.put = original;
    await env.browser.close();
  }
});

test('concurrent identical starts share an opening reservation before its store write completes', async () => {
  const env = await questionWatchFixture();
  const gate = questionWatchGate();
  const entered = questionWatchGate();
  const put = env.store.put;
  env.store.put = async (value) => {
    if (value.kind === 'question-browser-watch' && value.phase === 'starting') {
      entered.release();
      await gate.promise;
    }
    return put(value);
  };
  try {
    const first = env.browser.watchStart(env.input);
    await entered.promise;
    let settled = false;
    const second = env.browser.watchStart(env.input).then(
      (value) => {
        settled = true;
        return { value };
      },
      (error) => {
        settled = true;
        return { error };
      }
    );
    await delay(10);
    assert.equal(settled, false);
    gate.release();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.id, env.input.id);
    assert.equal(secondResult.error, undefined);
    assert.equal(secondResult.value.id, env.input.id);
    assert.equal(env.state.opens, 1);
    await env.until((s) => s.phase === 'sent');
    assert.equal(env.state.sends.length, 1);
  } finally {
    gate.release();
    env.store.put = put;
    await env.browser.close();
  }
});
