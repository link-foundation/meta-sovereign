import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import {
  guardedSend,
  recoverOutbox,
  resolveOutbox,
} from '../src/automation/outbox.js';
import { questionChoiceKey } from '../src/automation/question-choice-key.js';
import { createDefaultSender } from '../src/sources/browser-sender.js';
import {
  questionBrowserFixture,
  browserTarget,
} from '../../experiments/issue-56/question-browser-fixture.mjs';

const choose = (review, option = 'Yes') => ({
  id: review.id,
  option,
  confirm: true,
});

test('capabilities are accurate without opening a browser', async () => {
  let opens = 0;
  const send = createDefaultSender({
    browser: {
      openSession: () => {
        opens++;
        throw new Error('No browser');
      },
    },
  });
  const browser = createQuestionBrowser({ store: createMemoryStore(), send });
  assert.equal(browser.capabilities().available, true);
  assert.ok(
    browser.capabilities().sources.some((source) => source.id === 'hh')
  );
  assert.equal(opens, 0);
  assert.deepEqual(
    createQuestionBrowser({
      store: createMemoryStore(),
      send: async () => {},
    }).capabilities(),
    { available: false, sources: [] }
  );
  await browser.close();
  await send.close();
});

test('inspection freezes the actual question and ignores caller question and options', async () => {
  const env = await questionBrowserFixture();
  const review = await env.browser.inspect({
    ...browserTarget,
    question: 'Spoofed',
    options: ['Spoofed'],
  });
  assert.equal(review.chat, '7');
  assert.equal(review.plan.text, 'Yes');
  assert.deepEqual(review.answerOptions, ['Yes', 'No']);
  review.question.body = 'Caller changed it';
  review.answerOptions.push('Spoofed');
  assert.equal(
    (await env.browser.status(review)).question.body,
    env.state.snapshot.question.body
  );
  assert.deepEqual((await env.browser.status(review)).answerOptions, [
    'Yes',
    'No',
  ]);
  assert.equal(env.state.reads.length, 1);
  assert.equal(env.state.sends.length, 0);
});

test('exact reviewed confirmation is required and strict pending options cannot prefill', async () => {
  const env = await questionBrowserFixture();
  const review = await env.browser.inspect(browserTarget);
  await assert.rejects(
    env.browser.select({ ...choose(review), confirm: 'true' }),
    { code: 'confirm-required' }
  );
  await assert.rejects(env.browser.select(choose(review, 'YES')), {
    code: 'question-browser-option',
  });
  await assert.rejects(env.browser.prefill(review), {
    code: 'question-browser-no-draft',
  });
  env.state.snapshot.answerOptions = [];
  const pending = await env.browser.inspect(browserTarget);
  assert.equal(pending.plan.complete, false);
  await assert.rejects(env.browser.select(choose(pending)), {
    code: 'question-browser-option',
  });
  assert.equal(env.state.sends.length, 0);
  assert.equal(env.state.prefills.length, 0);
});

test('positive receipt survives a new review and service restart without another selection', async () => {
  const env = await questionBrowserFixture();
  const review = await env.browser.inspect(browserTarget);
  const sent = await env.browser.select(choose(review));
  assert.equal(sent.status, 'sent');
  assert.equal(sent.outbox.receipt.messageId, '102');
  assert.equal(env.state.sends[0].chat, '7');
  assert.equal(env.state.sends[0].automated, false);
  const restarted = createQuestionBrowser(env);
  assert.equal((await restarted.status(review)).status, 'sent');
  const another = await restarted.inspect(browserTarget);
  assert.equal(
    (await restarted.select(choose(another, 'No'))).code,
    'already-sent'
  );
  assert.equal(env.state.sends.length, 1);
});

test('manual selection reserves the question across automation owners and option changes', async () => {
  const env = await questionBrowserFixture();
  const review = await env.browser.inspect(browserTarget);
  await env.browser.select(choose(review));
  const draft = {
    ...env.state.sends[0],
    text: 'No',
    answer: { ...env.state.sends[0].answer, option: 'No' },
  };
  const outcome = await guardedSend({
    store: env.store,
    owner: 'automation:another',
    key: questionChoiceKey(draft),
    draft,
    send: env.send,
  });
  assert.equal(outcome.code, 'already-sent');
  assert.equal(env.state.sends.length, 1);
});

test('missing receipt remains unknown across recovered storage and never replays', async () => {
  const env = await questionBrowserFixture({
    send: async () => ({ via: 'browser' }),
  });
  const review = await env.browser.inspect(browserTarget);
  const outcome = await env.browser.select(choose(review));
  assert.equal(outcome.status, 'unknown');
  const store = createMemoryStore();
  await store.putMany(globalThis.structuredClone(await env.store.query()));
  await recoverOutbox(store);
  const restarted = createQuestionBrowser({
    store,
    send: env.send,
    clock: env.clock,
  });
  assert.equal((await restarted.status(review)).status, 'unknown');
  assert.equal((await restarted.select(choose(review))).code, 'send-in-doubt');
  assert.equal(env.state.sends.length, 1);
  await resolveOutbox(store, outcome.outbox.id, 'sent');
  const resolved = await restarted.status(review);
  assert.equal(resolved.outbox.resolvedBy, 'user');
  assert.equal(resolved.status, 'sent');
});

test('an interrupted durable send recovers as unknown without a browser read', async () => {
  const env = await questionBrowserFixture();
  const review = await env.browser.inspect(browserTarget);
  const outcome = await env.browser.select(choose(review));
  await env.store.put({
    ...outcome.outbox,
    status: 'sending',
    receipt: undefined,
  });
  assert.equal(await recoverOutbox(env.store), 1);
  assert.equal((await env.browser.status(review)).status, 'unknown');
  assert.equal(
    (await env.browser.select(choose(review))).code,
    'send-in-doubt'
  );
  assert.equal(env.state.reads.length, 1);
  assert.equal(env.state.sends.length, 1);
});

test('failed prewrite persistence and expired reviews cannot issue a selection', async () => {
  const env = await questionBrowserFixture();
  const review = await env.browser.inspect(browserTarget);
  const put = env.store.put;
  env.store.put = async (record) => {
    if (record.id.startsWith('outbox:')) {
      throw new Error('disk full');
    }
    return put(record);
  };
  assert.equal(
    (await env.browser.select(choose(review))).code,
    'outbox-unavailable'
  );
  env.state.now = new Date('2026-11-11T10:30:00Z');
  assert.equal((await env.browser.status(review)).expired, true);
  await assert.rejects(env.browser.select(choose(review)), {
    code: 'question-browser-expired',
  });
  assert.equal(env.state.sends.length, 0);
});

test('free text uses a confirmed owned prefill and never sends', async () => {
  const env = await questionBrowserFixture();
  env.state.snapshot.strictOptions = false;
  env.state.snapshot.answerOptions = [];
  const review = await env.browser.inspect(browserTarget);
  assert.equal((await env.browser.prefill(review)).prefilled, true);
  assert.equal(env.state.prefills[0].expected.question.id, '101');
  assert.equal(env.state.prefills[0].text, 'Yes');
  assert.equal(env.state.sends.length, 0);
  env.send.prefillAnswer = async () => ({});
  await assert.rejects(env.browser.prefill(review), {
    code: 'question-browser-prefill-unconfirmed',
  });
});

test('shutdown drains accepted browser reads and refuses new requests', async () => {
  const env = await questionBrowserFixture();
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  env.send.readAnswerChoices = async () => {
    await wait;
    return env.state.snapshot;
  };
  const read = env.browser.inspect(browserTarget);
  let closed = false;
  const close = env.browser.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(closed, false);
  await assert.rejects(env.browser.inspect(browserTarget), {
    code: 'question-browser-closed',
  });
  release();
  assert.equal((await read).question.id, '101');
  await close;
  assert.equal(closed, true);
});

test(
  'actual Lino storage restores confirmed and uncertain receipts without another provider call',
  { timeout: 20000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'question-browser-'));
    let store;
    try {
      for (const positive of [true, false]) {
        const file = join(directory, `${positive}.lino`);
        store = await createLinoTextStore(file);
        const env = await questionBrowserFixture({
          store,
          ...(positive ? {} : { send: async () => ({ via: 'browser' }) }),
        });
        const review = await env.browser.inspect(browserTarget);
        await env.browser.select(choose(review));
        await env.browser.close();
        await store.flush();
        await store.close();
        store = await createLinoTextStore(file);
        const restored = createQuestionBrowser({
          store,
          send: env.send,
          clock: env.clock,
        });
        await recoverOutbox(store);
        const status = await restored.status(review);
        assert.equal(status.status, positive ? 'sent' : 'unknown');
        assert.equal(
          status.outbox.receipt?.messageId,
          positive ? '102' : undefined
        );
        assert.equal(
          (await restored.select(choose(review, 'No'))).code,
          positive ? 'already-sent' : 'send-in-doubt'
        );
        assert.equal(env.state.sends.length, 1);
        assert.equal(env.state.reads.length, 1);
        await restored.close();
        await store.flush();
        await store.close();
        store = null;
      }
    } finally {
      await store?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
