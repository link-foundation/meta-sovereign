import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import { recoverOutbox, resolveOutbox } from '../src/automation/outbox.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { saveSettings } from '../src/automation/safety.js';
import { browserTarget } from '../../experiments/issue-56/question-browser-fixture.mjs';
import {
  questionTextFixture,
  textInput,
} from '../../experiments/issue-56/question-text-fixture.mjs';

test('reviewed text requires explicit capability and confirmation without opening for status', async () => {
  const env = await questionTextFixture();
  try {
    assert.deepEqual(env.browser.capabilities().textSources, [
      { id: 'hh', name: 'HeadHunter' },
    ]);
    assert.equal(env.state.reads.length, 0);
    const review = await env.browser.inspect(browserTarget);
    assert.equal(typeof env.browser.replyText, 'function');
    for (const confirm of [undefined, false, 'true', 1]) {
      await assert.rejects(
        env.browser.replyText({ ...textInput(review), confirm }),
        { code: 'confirm-required' }
      );
    }
    env.send.textReplySources = () => [{ id: 'vk', name: 'VK' }];
    assert.equal(env.browser.capabilities().textSources, undefined);
    await assert.rejects(env.browser.replyText(textInput(review)), {
      code: 'answer-text-unavailable',
    });
    assert.equal((await env.browser.status(review)).status, 'review');
    assert.equal(env.state.reads.length, 1);
    assert.equal(env.state.textReplies.length, 0);
  } finally {
    await env.browser.close();
  }
});

test('strict, outgoing, owner-draft, missing-turn, prefilled and expired reviews refuse text before reservation', async () => {
  for (const patch of [
    { strictOptions: true },
    { answerOptions: ['Yes'] },
    { hasDraft: true },
    { pendingTurn: undefined },
  ]) {
    const env = await questionTextFixture();
    try {
      Object.assign(env.state.snapshot, patch);
      const review = await env.browser.inspect(browserTarget);
      await assert.rejects(env.browser.replyText(textInput(review)), {
        code: 'question-browser-text',
      });
      assert.equal(env.state.textReplies.length, 0);
      assert.equal(
        (await env.store.query((row) => row.id.startsWith('outbox:'))).length,
        0
      );
    } finally {
      await env.browser.close();
    }
  }
  const env = await questionTextFixture();
  try {
    const review = await env.browser.inspect(browserTarget);
    for (const text of ['', ' ', null, 'x'.repeat(12001)]) {
      await assert.rejects(env.browser.replyText(textInput(review, text)), {
        code: 'question-browser-text',
      });
    }
    const saved = await env.store.get(review.id);
    await env.store.put({ ...saved, prefilled: true });
    await assert.rejects(env.browser.replyText(textInput(review)), {
      code: 'question-browser-text',
    });
    await env.store.put({
      ...saved,
      snapshot: {
        ...saved.snapshot,
        question: { ...saved.snapshot.question, outgoing: true },
      },
    });
    await assert.rejects(env.browser.replyText(textInput(review)), {
      code: 'question-browser-text',
    });
    env.state.now = new Date('2026-11-11T10:30:00Z');
    await assert.rejects(env.browser.replyText(textInput(review)), {
      code: 'question-browser-expired',
    });
    assert.equal(env.state.textReplies.length, 0);
  } finally {
    await env.browser.close();
  }
});

test('full bounded text and frozen pending turn persist before one positive native receipt', async () => {
  const env = await questionTextFixture();
  const text = `Reviewed reply\n${'x'.repeat(11985)}`;
  let flushed = false;
  env.store.flush = async () => {
    flushed = true;
  };
  const reply = env.send.replyText;
  env.send.replyText = async (input) => {
    assert.equal(flushed, true);
    const entries = await env.store.query((row) =>
      row.id.startsWith('outbox:')
    );
    assert.equal(entries[0].status, 'sending');
    assert.equal(entries[0].text, text);
    assert.deepEqual(input.expected, env.state.snapshot);
    return reply(input);
  };
  try {
    const review = await env.browser.inspect(browserTarget);
    const result = await env.browser.replyText(textInput(review, text));
    assert.equal(result.status, 'sent');
    assert.equal(result.outbox.answerType, 'text');
    assert.equal(result.outbox.text, text);
    assert.equal(result.outbox.receipt.text, text);
    assert.equal(result.outbox.receipt.messageId, '102');
    assert.equal(
      (await env.browser.replyText(textInput(review, 'Changed reply'))).code,
      'already-sent'
    );
    const next = await env.browser.inspect(browserTarget);
    assert.equal(next.status, 'sent');
    assert.equal(
      (await env.browser.replyText(textInput(next))).code,
      'already-sent'
    );
    env.state.snapshot.strictOptions = true;
    env.state.snapshot.answerOptions = ['Yes', 'No'];
    const choice = await env.browser.inspect(browserTarget);
    assert.equal(
      (await env.browser.select({ id: choice.id, option: 'No', confirm: true }))
        .code,
      'already-sent'
    );
    assert.equal(env.state.textReplies.length, 1);
    assert.equal(env.state.sends.length, 0);
    assert.equal((await env.browser.status(review)).outbox.receipt.text, text);
    assert.equal(env.state.reads.length, 3);
  } finally {
    await env.browser.close();
  }
});

test('a native selection also blocks a later free-text review of the same question', async () => {
  const env = await questionTextFixture();
  try {
    env.state.snapshot.strictOptions = true;
    env.state.snapshot.answerOptions = ['Yes', 'No'];
    const choice = await env.browser.inspect(browserTarget);
    await env.browser.select({ id: choice.id, option: 'Yes', confirm: true });
    env.state.snapshot.strictOptions = false;
    env.state.snapshot.answerOptions = [];
    // The prior choice receipt cannot be relabelled as a text receipt.
    await assert.rejects(env.browser.inspect(browserTarget), {
      code: 'question-browser-receipt-missing',
    });
    await assert.rejects(env.browser.replyText(textInput(choice)), {
      code: 'question-browser-text',
    });
    assert.equal(env.state.sends.length, 1);
    assert.equal(env.state.textReplies.length, 0);
  } finally {
    await env.browser.close();
  }
});

test('chat opt-out refuses text without reserving; definite refusal allows another explicit approval', async () => {
  const env = await questionTextFixture();
  try {
    const review = await env.browser.inspect(browserTarget);
    await saveSettings(env.store, { optOut: [{ source: 'hh', chat: '7' }] });
    assert.equal(
      (await env.browser.replyText(textInput(review))).code,
      'opted-out'
    );
    assert.equal(env.state.textReplies.length, 0);
    await saveSettings(env.store, { optOut: [] });
    const reply = env.send.replyText;
    env.send.replyText = async () => {
      throw Object.assign(new Error('Owner draft appeared'), {
        code: 'answer-draft-present',
      });
    };
    const refused = await env.browser.replyText(textInput(review));
    assert.equal(refused.status, 'failed');
    assert.equal(refused.code, 'answer-draft-present');
    env.send.replyText = reply;
    assert.equal(
      (await env.browser.replyText(textInput(review))).status,
      'sent'
    );
    const sent = await env.browser.status(review);
    await env.store.put({
      ...sent.outbox,
      receipt: { ...sent.outbox.receipt, text: 'Altered saved receipt' },
    });
    await assert.rejects(env.browser.status(review), {
      code: 'question-browser-receipt-missing',
    });
    assert.equal(env.state.textReplies.length, 1);
  } finally {
    await env.browser.close();
  }
});

test('missing, wrong-target, altered-tail and invalid message receipts remain unknown without retry', async () => {
  const invalid = [
    () => ({}),
    (value) => ({ ...value, source: 'vk' }),
    (value) => ({ ...value, chat: '8' }),
    (value) => ({ ...value, text: `${value.text.slice(0, -1)}!` }),
    (value) => ({ ...value, messageId: '' }),
  ];
  for (const change of invalid) {
    const env = await questionTextFixture({
      replyText: async (input) =>
        change({
          via: 'browser',
          source: input.source,
          chat: input.chat,
          text: input.text,
          messageId: '102',
        }),
    });
    try {
      const review = await env.browser.inspect(browserTarget);
      const result = await env.browser.replyText(
        textInput(review, 'x'.repeat(3000))
      );
      assert.equal(result.status, 'unknown');
      assert.equal(result.outbox.receipt, undefined);
      assert.equal(
        (await env.browser.replyText(textInput(review))).code,
        'send-in-doubt'
      );
      assert.equal(env.state.textReplies.length, 1);
      await resolveOutbox(env.store, result.outbox.id, 'sent');
      assert.equal(
        (await env.browser.status(review)).outbox.resolvedBy,
        'user'
      );
    } finally {
      await env.browser.close();
    }
  }
});

test('pre-dispatch writes and flushes refuse safely; post-dispatch persistence cannot enable replay', async () => {
  for (const phase of ['put', 'flush', 'settle']) {
    const env = await questionTextFixture();
    const put = env.store.put;
    env.store.put = async (row) => {
      if (
        row.id.startsWith('outbox:') &&
        (phase === 'put' || (phase === 'settle' && row.status === 'sent'))
      ) {
        throw new Error('Private fixture disk refusal');
      }
      return put(row);
    };
    env.store.flush = async () => {
      if (phase === 'flush') {
        throw new Error('Private fixture flush refusal');
      }
    };
    try {
      const review = await env.browser.inspect(browserTarget);
      const result = await env.browser.replyText(textInput(review));
      assert.equal(
        result.code,
        phase === 'settle' ? undefined : 'outbox-unavailable'
      );
      assert.equal(env.state.textReplies.length, phase === 'settle' ? 1 : 0);
      if (phase !== 'put') {
        assert.equal((await env.browser.status(review)).status, 'sending');
        await recoverOutbox(env.store);
        assert.equal(
          (await env.browser.replyText(textInput(review))).code,
          'send-in-doubt'
        );
      }
    } finally {
      await env.browser.close();
    }
  }
});

test('concurrent reviewed replies share one reservation and shutdown drains the admitted write', async () => {
  let release;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const env = await questionTextFixture({
    replyText: async (input) => {
      started();
      await held;
      return {
        via: 'browser',
        source: input.source,
        chat: input.chat,
        text: input.text,
        messageId: '102',
      };
    },
  });
  const review = await env.browser.inspect(browserTarget);
  const next = await env.browser.inspect(browserTarget);
  const first = env.browser.replyText(textInput(review));
  await ready;
  assert.equal(
    (await env.browser.replyText(textInput(next, 'Another body'))).code,
    'send-in-doubt'
  );
  let closed = false;
  const closing = env.browser.close().then(() => {
    closed = true;
  });
  await assert.rejects(env.browser.replyText(textInput(review)), {
    code: 'question-browser-closed',
  });
  assert.equal(closed, false);
  release();
  assert.equal((await first).status, 'sent');
  await closing;
  assert.equal(closed, true);
  assert.equal(env.state.textReplies.length, 1);
});

test(
  'actual Lino reopen preserves confirmed and uncertain text reservations without browser access',
  { timeout: 20000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'question-text-'));
    let store;
    try {
      for (const positive of [true, false]) {
        const path = join(directory, `${positive}.lino`);
        store = await createLinoTextStore(path);
        const env = await questionTextFixture({
          store,
          ...(positive ? {} : { replyText: async () => ({}) }),
        });
        const review = await env.browser.inspect(browserTarget);
        await env.browser.replyText(textInput(review));
        await env.browser.close();
        await store.flush();
        await store.close();
        store = await createLinoTextStore(path);
        const restored = createQuestionBrowser({
          store,
          send: env.send,
          clock: env.clock,
        });
        try {
          await recoverOutbox(store);
          assert.equal(
            (await restored.status(review)).status,
            positive ? 'sent' : 'unknown'
          );
          assert.equal(
            (await restored.replyText(textInput(review))).code,
            positive ? 'already-sent' : 'send-in-doubt'
          );
          assert.equal(env.state.textReplies.length, 1);
          assert.equal(env.state.reads.length, 1);
        } finally {
          await restored.close();
        }
        await store.close();
        store = null;
      }
    } finally {
      await store?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
