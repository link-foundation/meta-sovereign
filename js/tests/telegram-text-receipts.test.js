import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendText, sendError } from '../src/sources/telegram-send.js';
import { guardedSend, listOutbox } from '../src/automation/outbox.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createDefaultSender } from '../src/sources/browser-sender.js';
import { named } from './helpers/telegram-fakes.mjs';
import { messageAck } from './helpers/telegram-message-ack.mjs';

const fixture = (answer) => {
  const calls = [];
  const client = {
    getInputEntity: async () => ({ userId: 42n }),
    invoke: async (request) => {
      calls.push(request);
      return answer(request, calls.length);
    },
  };
  const args = {
    client,
    Api: { messages: { SendMessage: named('messages.SendMessage') } },
    helpers: { readBigIntFromBuffer: (bytes) => bytes.readBigInt64LE() },
    peer: '42',
    text: 'hello',
    clientId: 'receipt-case',
  };
  return { args, calls };
};
const unknown = { code: 'send-unknown', ambiguous: true, fallback: false };
test('raw text acknowledgements work without the private SDK response parser', async () => {
  const { args } = fixture((request) => messageAck(request, 19));
  const parts = await sendText(args);
  assert.equal(parts[0].id, 19);
});
test('missing, invalid and unrelated text receipts stop the remaining parts', async () => {
  for (const answer of [
    null,
    {},
    { updates: [] },
    { className: 'UpdateShortSentMessage', id: 0 },
    { className: 'UpdateShortSentMessage', id: -1 },
    { className: 'UpdateShortSentMessage', id: 2147483648 },
    messageAck({ randomId: 123n }, 12),
    {
      updates: [
        {
          className: 'UpdateNewMessage',
          message: { id: 2, out: true, peerId: { channelId: 42n } },
        },
      ],
    },
  ]) {
    const { args, calls } = fixture(() => answer);
    args.client._getResponseMessage = () => ({ id: 999 });
    await assert.rejects(
      sendText({ ...args, text: 'abcdef', maxLength: 3 }),
      unknown
    );
    assert.equal(calls.length, 1);
  }
});
test('library-only sends also require a positive Telegram message ID', async () => {
  for (const id of [undefined, null, 0, -1, 2147483648]) {
    await assert.rejects(
      sendText({
        client: { sendMessage: async () => ({ id }) },
        peer: '42',
        text: 'hi',
      }),
      unknown
    );
  }
  const sent = await sendText({
    client: { sendMessage: async () => ({ id: 12, date: 5 }) },
    peer: '42',
    text: 'hi',
  });
  assert.equal(sent[0].id, 12);
});
test('duplicate random IDs without a message receipt stay uncertain through the account error mapper', async () => {
  const { args, calls } = fixture(() => {
    throw Object.assign(new Error('RANDOM_ID_DUPLICATE'), {
      errorMessage: 'RANDOM_ID_DUPLICATE',
    });
  });
  await assert.rejects(
    sendText(args).catch((error) => {
      throw sendError(error);
    }),
    unknown
  );
  assert.equal(calls.length, 1);
});
test('a refusal after an acknowledged part remains partial/uncertain and never posts the rest', async () => {
  const { args, calls } = fixture((request, index) => {
    if (index === 1) {
      return messageAck(request, 19);
    }
    throw Object.assign(new Error('CHAT_WRITE_FORBIDDEN'), {
      errorMessage: 'CHAT_WRITE_FORBIDDEN',
    });
  });
  await assert.rejects(
    sendText({ ...args, text: 'abcdefghi', maxLength: 3 }).catch((error) => {
      throw sendError(error);
    }),
    unknown
  );
  assert.equal(calls.length, 2);
});
test('a definite refusal before the first accepted part retains its actionable code', async () => {
  const { args } = fixture(() => {
    throw Object.assign(new Error('CHAT_WRITE_FORBIDDEN'), {
      errorMessage: 'CHAT_WRITE_FORBIDDEN',
    });
  });
  await assert.rejects(
    sendText(args).catch((error) => {
      throw sendError(error);
    }),
    {
      code: 'write-forbidden',
      fallback: false,
    }
  );
});
test('a null SDK rejection reaches the existing error mapper', async () => {
  const { args } = fixture(() => Promise.reject(null));
  await assert.rejects(
    sendText(args).catch((error) => {
      throw sendError(error);
    }),
    { code: 'send-failed', fallback: false }
  );
});
test('observer failures after an RPC and receipt diagnostics never claim a rejected write', async () => {
  const logs = [];
  const { args } = fixture((request) => messageAck(request, 19));
  await assert.rejects(
    sendText({
      ...args,
      text: 'private body',
      log: (entry) => logs.push(entry),
      onResult: () => {
        throw new Error('local observer unavailable');
      },
    }),
    unknown
  );
  assert.deepEqual(logs.at(-1), {
    level: 'debug',
    event: 'telegram_send_unknown',
    part: 1,
    acknowledged: 0,
    duplicate: false,
  });
  assert.ok(!JSON.stringify(logs).includes('private body'));
});
test('missing receipts remain unknown in the shared durable outbox and never fall back or replay', async () => {
  const store = createMemoryStore();
  const { args, calls } = fixture(() => ({ updates: [] }));
  let browser = 0;
  const send = createDefaultSender({
    getSource: () => ({
      live: {
        post: (draft) =>
          sendText({ ...args, ...draft }).catch((error) => {
            throw sendError(error);
          }),
      },
    }),
    browser: {
      send: async () => {
        browser += 1;
      },
    },
  });
  const draft = { source: 'telegram', chat: '42', text: 'hello' };
  const first = await guardedSend({ store, draft, send });
  assert.equal(first.status, 'unknown');
  assert.equal(first.code, 'send-unknown');
  assert.equal((await listOutbox(store))[0].status, 'unknown');
  const next = await guardedSend({ store, draft, send });
  assert.equal(next.code, 'send-in-doubt');
  assert.equal(calls.length, 1);
  assert.equal(browser, 0);
});
