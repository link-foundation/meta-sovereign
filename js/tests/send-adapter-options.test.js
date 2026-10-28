import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdapterSender } from '../src/crm/reengage.js';
import { createDefaultSender } from '../src/sources/browser-sender.js';
import { sendText } from '../src/sources/telegram-send.js';
import { named } from './helpers/telegram-fakes.mjs';
import { createTelegramBotLive } from '../src/sources/telegram.js';

test('the shared sender preserves reply, quote, idempotency and delivery options to the Telegram wire request', async () => {
  const requests = [];
  const client = {
    getInputEntity: async (peer) => peer,
    invoke: async (request) => {
      requests.push(request);
      return { className: 'UpdateShortSentMessage', id: 90 };
    },
  };
  const Api = {
    InputReplyToMessage: named('InputReplyToMessage'),
    messages: { SendMessage: named('messages.SendMessage') },
  };
  const helpers = { readBigIntFromBuffer: (bytes) => bytes.readBigInt64LE() };
  const send = createAdapterSender({
    getSource: () => ({
      live: {
        post: async (draft) =>
          sendText({ ...draft, peer: draft.chat, Api, client, helpers }),
      },
    }),
  });
  const draft = {
    source: 'telegram',
    chat: '42',
    text: 'A reply',
    clientId: 'same-draft',
    replyTo: 7,
    replyQuote: 'original',
    topic: 3,
    silent: true,
    scheduleDate: 1234567890,
  };
  await send(draft);
  await send(draft);
  assert.equal(requests[0].replyTo.replyToMsgId, 7);
  assert.equal(requests[0].replyTo.topMsgId, 3);
  assert.equal(requests[0].replyTo.quoteText, 'original');
  assert.equal(requests[0].silent, true);
  assert.equal(requests[0].scheduleDate, draft.scheduleDate);
  assert.equal(requests[0].randomId, requests[1].randomId);
});

test('a browser fallback refuses a reply rather than posting it as ordinary text', async () => {
  let sent = 0;
  const send = createDefaultSender({
    browser: {
      send: async () => {
        sent += 1;
      },
    },
  });
  await assert.rejects(
    send({ source: 'telegram', chat: '42', text: 'reply', replyTo: 7 }),
    { code: 'unsupported-send-options' }
  );
  assert.equal(sent, 0);
});

test('the Bot API also retains its reply target and quote', async () => {
  let body;
  const live = createTelegramBotLive({
    token: 'fake',
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 9 } }),
      };
    },
  });
  const send = createAdapterSender({ getSource: () => ({ live }) });
  await send({
    source: 'telegram',
    chat: '42',
    text: 'reply',
    replyTo: 7,
    replyQuote: 'original',
    silent: true,
    topic: 3,
  });
  assert.deepEqual(body.reply_parameters, { message_id: 7, quote: 'original' });
  assert.equal(body.message_thread_id, 3);
  assert.equal(body.disable_notification, true);
});
