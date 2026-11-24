import test from 'node:test';
import assert from 'node:assert/strict';
import { questionBrowserApi } from '../src/web/question-browser-api.js';
import { createDefaultSender } from '../src/sources/browser-sender.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  questionBrowserCli,
  questionBrowserHttp,
} from '../../experiments/issue-56/question-browser-clients.mjs';
import { browserTarget } from '../../experiments/issue-56/question-browser-fixture.mjs';
import {
  questionTextFixture,
  textInput,
} from '../../experiments/issue-56/question-text-fixture.mjs';

test('default text capability is honest without a provider launch or plain-text send', async () => {
  let opens = 0;
  const send = createDefaultSender({
    browser: {
      openSession: async () => {
        opens += 1;
        throw new Error('Unexpected browser');
      },
    },
  });
  try {
    assert.deepEqual(send.textReplySources(), [
      { id: 'hh', name: 'HeadHunter' },
    ]);
    assert.equal(opens, 0);
  } finally {
    await send.close();
  }
});

test('CLI text reply requires explicit confirmation and shares durable read-only status', async () => {
  const env = await questionTextFixture();
  const call = questionBrowserCli(env);
  try {
    const review = (await call('inspect', browserTarget)).value;
    const input = textInput(review);
    assert.equal(
      (await call('reply-text', { ...input, confirm: false })).code,
      1
    );
    const sent = await call('reply-text', { ...input, confirm: 'true' });
    assert.equal(sent.value.status, 'sent');
    assert.equal(
      (await call('status', { id: review.id })).value.outbox.receipt.text,
      input.text
    );
    assert.equal((await call('reply-text', input)).value.code, 'already-sent');
    assert.equal(env.state.textReplies.length, 1);
    assert.equal(env.state.sends.length, 0);
    assert.equal(env.state.reads.length, 1);
  } finally {
    await env.browser.close();
  }
});

test(
  'text and binary Lino require trusted explicit text approval and recover the same receipt',
  { timeout: 20000 },
  async () => {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const env = await questionTextFixture();
      const { server, call: request } = await questionBrowserHttp(env);
      const call = async (action, input, headers) => {
        const response = await request(action, input, type, headers);
        assert.equal(response.contentType, type);
        return response;
      };
      try {
        const review = (await call('inspect', browserTarget)).body;
        assert.equal(
          (
            await call('reply-text', textInput(review), {
              origin: 'https://untrusted.test',
            })
          ).status,
          403
        );
        assert.equal(
          (await call('reply-text', { ...textInput(review), confirm: 'true' }))
            .body.code,
          'confirm-required'
        );
        const result = await call('reply-text', textInput(review));
        assert.equal(result.body.status, 'sent');
        assert.equal(result.body.outbox.receipt.text, textInput(review).text);
        assert.equal(
          (await call('status', { id: review.id })).body.outbox.receipt
            .messageId,
          '102'
        );
        assert.equal(
          (await call('reply-text', textInput(review))).body.code,
          'already-sent'
        );
        assert.equal(env.state.textReplies.length, 1);
        assert.equal(env.state.sends.length, 0);
        assert.equal(env.state.reads.length, 1);
      } finally {
        await server.close();
        await env.browser.close();
      }
    }
  }
);

test('browser text API sends once and validates full receipts before read-only recovery', async () => {
  const env = await questionTextFixture();
  const calls = [];
  let value;
  const remote = {
    get: async () => env.browser.capabilities(),
    report: async (...args) => {
      calls.push(args);
      return value;
    },
  };
  const api = questionBrowserApi({ remote });
  try {
    assert.equal(
      (await api.browserAnswerCapabilities()).textSources[0].id,
      'hh'
    );
    const review = await env.browser.inspect(browserTarget);
    const input = textInput(review, 'x'.repeat(3000));
    value = await env.browser.replyText(input);
    assert.equal((await api.replyBrowserText(input)).status, 'sent');
    assert.deepEqual(calls.at(-1), [
      '/api/automations/answers/browser/reply-text',
      input,
      { network: true, read: false },
    ]);
    await api.browserAnswerStatus({ id: review.id });
    assert.deepEqual(calls.at(-1)[2], { network: true, read: true });
    for (const receipt of [
      undefined,
      { ...value.outbox.receipt, text: `${input.text.slice(0, -1)}!` },
      { ...value.outbox.receipt, source: 'vk' },
    ]) {
      const saved = value;
      value = { ...saved, outbox: { ...saved.outbox, receipt } };
      await assert.rejects(api.browserAnswerStatus({ id: review.id }), {
        code: 'question-browser-receipt-missing',
      });
      value = saved;
    }
    const saved = value;
    value = {
      ...value,
      outbox: { ...value.outbox, text: input.text.slice(0, 2000) },
    };
    await assert.rejects(api.browserAnswerStatus({ id: review.id }), {
      code: 'question-browser-receipt-missing',
    });
    value = saved;
    remote.report = async (...args) => {
      calls.push(args);
      throw new Error('Private fixture lost response');
    };
    await assert.rejects(api.replyBrowserText(input));
    assert.equal(
      calls.filter(([path]) => path.endsWith('/reply-text')).length,
      2
    );
    remote.get = async () => ({
      available: true,
      sources: [{ id: 'hh', name: 'HeadHunter' }],
      textSources: [{ id: 'vk', name: 'VK' }],
    });
    await assert.rejects(api.browserAnswerCapabilities());
    assert.equal(env.state.textReplies.length, 1);
    assert.equal(env.state.reads.length, 1);
  } finally {
    await env.browser.close();
  }
});
