import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramBotLive } from '../src/sources/telegram.js';

const transport = (result = { message_id: 71, chat: { id: -10042 } }) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      method: new URL(url).pathname.split('/').at(-1),
      body: JSON.parse(init.body),
    });
    return new globalThis.Response(JSON.stringify({ ok: true, result }));
  };
  return {
    live: createTelegramBotLive({ token: 'example-bot-token', fetchImpl }),
    calls,
  };
};

test('Telegram explicitly selected HTML is sent as HTML while plain text stays literal', async () => {
  const { live, calls } = transport();
  await live.post({ chat: '-10042', text: '<b>News</b>', format: 'html' });
  assert.equal(calls[0].body.parse_mode, 'HTML');
  await live.post({ chat: '-10042', text: '<b>literal</b>', format: 'plain' });
  assert.equal(calls[1].body.parse_mode, undefined);
});

test('Telegram missing send receipt is unknown instead of message ID undefined', async () => {
  const { live, calls } = transport({});
  await assert.rejects(live.post({ chat: '-10042', text: 'News' }), {
    code: 'send-unknown',
    ambiguous: true,
    safeToRetry: false,
  });
  assert.equal(calls.length, 1);
});

test('Telegram public publishing preserves the exact target and explicit HTML mode', async () => {
  const { live, calls } = transport();
  const sent = await live.publishPost('<b>News</b>', {
    chat: '@announcements',
    format: 'html',
  });
  assert.deepEqual(sent, { ok: true, messageId: '71', chat: '-10042' });
  assert.equal(calls[0].method, 'sendMessage');
  assert.equal(calls[0].body.chat_id, '@announcements');
  assert.equal(calls[0].body.text, '<b>News</b>');
  assert.equal(calls[0].body.parse_mode, 'HTML');
  await live.publishPost({ text: '<b>literal</b>', chat: '-10042' });
  assert.equal(calls[1].body.parse_mode, undefined);
});

test('Telegram public deletion requires a positive provider receipt', async () => {
  const { live, calls } = transport(true);
  assert.deepEqual(await live.deletePost({ chat: '-10042', messageId: '71' }), {
    ok: true,
    deleted: true,
    chat: '-10042',
    messageId: '71',
  });
  assert.deepEqual(calls[0], {
    method: 'deleteMessage',
    body: { chat_id: '-10042', message_id: 71 },
  });
  for (const result of [false, null, {}]) {
    const failed = transport(result);
    await assert.rejects(
      failed.live.deletePost({ chat: '-10042', messageId: '71' }),
      { code: result === false ? 'not-deleted' : 'send-unknown' }
    );
    assert.equal(failed.calls.length, 1);
  }
});

test('Telegram validates explicit format, destination and deletion IDs before HTTP', async () => {
  const { live, calls } = transport();
  for (const draft of [
    { chat: '-10042', text: ' ' },
    { text: 'News' },
    { chat: '-10042', text: 'News', format: 'markdown' },
  ]) {
    await assert.rejects(live.publishPost(draft), { code: 'bad-draft' });
  }
  await assert.rejects(
    live.deletePost({ chat: '-10042', messageId: 'not-an-id' }),
    { code: 'bad-draft' }
  );
  await assert.rejects(
    live.deletePost({ chat: '-10042', messageId: '9007199254740993' }),
    { code: 'bad-draft' }
  );
  assert.equal(calls.length, 0);
});

test('Telegram checks bot identity with a read-only getMe probe', async () => {
  const { live, calls } = transport({ id: 123, is_bot: true });
  assert.deepEqual(await live.testConnection(), {
    ok: true,
    verified: true,
    mode: 'bot',
    botId: '123',
    permissionsVerified: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'getMe');
  await assert.rejects(
    transport({ id: 123, is_bot: false }).live.testConnection(),
    { code: 'bad-response' }
  );
});

test('Telegram publication connection loss and server errors remain uncertain without retry', async () => {
  const responses = [
    async () => {
      throw new Error('connection lost');
    },
    async () =>
      new globalThis.Response(
        JSON.stringify({ ok: false, description: 'Internal server error' }),
        { status: 500 }
      ),
    async () => new globalThis.Response('not-json'),
  ];
  for (const respond of responses) {
    let calls = 0;
    const live = createTelegramBotLive({
      token: 'example-bot-token',
      fetchImpl: async () => {
        calls += 1;
        return respond();
      },
    });
    await assert.rejects(live.publishPost({ chat: '-10042', text: 'News' }), {
      code: 'send-unknown',
      ambiguous: true,
      safeToRetry: false,
    });
    assert.equal(calls, 1);
  }
});

test('Telegram an explicit permission refusal is retained as a known failure', async () => {
  const live = createTelegramBotLive({
    token: 'example-bot-token',
    fetchImpl: async () =>
      new globalThis.Response(
        JSON.stringify({
          ok: false,
          error_code: 403,
          description: 'Forbidden: bot is not a member of the channel chat',
        }),
        { status: 403 }
      ),
  });
  await assert.rejects(live.publishPost({ chat: '-10042', text: 'News' }), {
    status: 403,
    ambiguous: false,
    safeToRetry: true,
    message: /bot is not a member/,
  });
});
