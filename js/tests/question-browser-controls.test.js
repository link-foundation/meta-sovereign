import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionBrowserApi } from '../src/web/question-browser-api.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  questionBrowserFixture,
  browserTarget,
} from '../../experiments/issue-56/question-browser-fixture.mjs';
import { pendingSnapshot } from '../../experiments/issue-56/pending-turn-fixture.mjs';

const inputFor = (review) => ({ id: review.id, option: 'Yes', confirm: true });

test('CLI exposes current choices, confirmed selection and read-only durable recovery', async () => {
  const env = await questionBrowserFixture();
  env.state.snapshot = pendingSnapshot();
  const cli = createAutomationCommands({
    openStore: async () => env.store,
    send: env.send,
  });
  const output = [];
  const call = async (action, extra = {}) => {
    const code = await cli.automations(
      {
        _: ['answers', 'browser', action],
        json: true,
        now: env.state.now.toISOString(),
        ...extra,
      },
      (line) => output.push(line)
    );
    return {
      code,
      value: code === 0 ? JSON.parse(output.at(-1)) : output.at(-1),
    };
  };
  assert.equal((await call('show')).value.available, true);
  assert.equal(env.state.reads.length, 0);
  const review = (await call('inspect', browserTarget)).value;
  assert.equal(review.plan.text, 'Yes');
  assert.deepEqual(review.pendingTurn, pendingSnapshot().pendingTurn);
  assert.equal(review.plan.pending.blocked, true);
  assert.equal(
    (await call('select', { id: review.id, option: 'Yes' })).code,
    1
  );
  assert.equal(env.state.sends.length, 0);
  assert.equal((await call('select', inputFor(review))).value.status, 'sent');
  assert.equal(
    (await call('status', { id: review.id })).value.outbox.receipt.messageId,
    '102'
  );
  assert.equal(
    (await call('select', inputFor(review))).value.code,
    'already-sent'
  );
  assert.equal(env.state.sends.length, 1);
});

test(
  'default text/binary Lino routes share exact reviews, origin checks and uncertainty',
  { timeout: 20000 },
  async () => {
    const env = await questionBrowserFixture();
    env.state.snapshot = pendingSnapshot();
    const server = await startServer({
      store: env.store,
      port: 0,
      localUi: false,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false, send: env.send },
      log: null,
    });
    const call = async (action, input, type = LINO_TEXT, extra = {}) => {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/automations/answers/browser${action ? `/${action}` : ''}`,
        {
          method: input ? 'POST' : 'GET',
          headers: { accept: type, 'content-type': type, ...extra },
          ...(input ? { body: encodeWire(input, type) } : {}),
        }
      );
      return {
        status: response.status,
        body: await readWireResponse(response),
      };
    };
    try {
      assert.equal((await call('')).body.available, true);
      assert.equal(env.state.reads.length, 0);
      assert.equal(
        (
          await call('inspect', browserTarget, LINO_TEXT, {
            origin: 'https://untrusted.test',
          })
        ).status,
        403
      );
      assert.equal(env.state.reads.length, 0);
      const review = (await call('inspect', browserTarget)).body;
      assert.equal(review.question.id, '101');
      assert.deepEqual(review.pendingTurn, pendingSnapshot().pendingTurn);
      assert.equal(review.plan.pending.blocked, true);
      assert.equal(
        (
          await call(
            'select',
            { ...inputFor(review), confirm: false },
            LINO_BINARY
          )
        ).body.code,
        'confirm-required'
      );
      assert.equal(env.state.sends.length, 0);
      const selected = await call('select', inputFor(review), LINO_BINARY);
      assert.equal(selected.body.status, 'sent');
      assert.deepEqual(selected.body.pendingTurn, review.pendingTurn);
      assert.equal(
        (await call('status', { id: review.id })).body.outbox.receipt.option,
        'Yes'
      );
      assert.equal(
        (await call('select', inputFor(review))).body.code,
        'already-sent'
      );
      assert.equal(env.state.sends.length, 1);
      assert.equal(env.state.reads.length, 1);
    } finally {
      await server.close();
    }
  }
);

test('browser API keeps writes single-call, recovers by ID and requires a positive receipt', async () => {
  const env = await questionBrowserFixture();
  const review = await env.browser.inspect(browserTarget);
  const calls = [];
  let value = review;
  const api = questionBrowserApi({
    remote: {
      get: async () => env.browser.capabilities(),
      report: async (...args) => {
        calls.push(args);
        return value;
      },
    },
  });
  await api.inspectBrowserAnswer(browserTarget);
  assert.deepEqual(calls.at(-1)[2], { network: true, read: false });
  value = await env.browser.select(inputFor(review));
  assert.equal(
    (await api.selectBrowserAnswer(inputFor(review))).status,
    'sent'
  );
  assert.deepEqual(calls.at(-1)[2], { network: true, read: false });
  await api.browserAnswerStatus({ id: review.id });
  assert.deepEqual(calls.at(-1)[2], { network: true, read: true });
  value = { ...value, outbox: { ...value.outbox, receipt: undefined } };
  await assert.rejects(api.browserAnswerStatus({ id: review.id }), {
    code: 'question-browser-receipt-missing',
  });
  value = {
    ...review,
    id: 'question-browser:11111111-1111-1111-1111-111111111111',
  };
  await assert.rejects(api.browserAnswerStatus({ id: review.id }), {
    code: 'question-browser-review-changed',
  });
  assert.equal(calls.length, 5);
});

test('offline or malformed browser responses cannot fabricate drafts or sent status', async () => {
  const remote = { get: async () => null, report: async () => null };
  const api = questionBrowserApi({ remote });
  assert.deepEqual(await api.browserAnswerCapabilities(), {
    available: false,
    sources: [],
  });
  await assert.rejects(api.inspectBrowserAnswer(browserTarget), {
    code: 'question-browser-unconfirmed',
  });
  remote.get = async () => ({ available: true, sources: [] });
  await assert.rejects(api.browserAnswerCapabilities());
  const env = await questionBrowserFixture();
  const review = await env.browser.inspect(browserTarget);
  for (const patch of [
    { answerOptions: null },
    { strictOptions: 'true' },
    { question: { ...review.question, id: '' } },
  ]) {
    remote.report = async () => ({ ...review, ...patch });
    await assert.rejects(api.inspectBrowserAnswer(browserTarget));
  }
});
