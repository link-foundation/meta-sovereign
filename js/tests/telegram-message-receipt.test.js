import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageReceipt } from '../src/sources/telegram-message-receipt.js';
import { messageAck } from './helpers/telegram-message-ack.mjs';

const request = { randomId: 42n, peer: { userId: 7n } };
const outgoing = (extra = {}) => ({
  className: 'UpdateNewMessage',
  message: { id: 25, out: true, peerId: { userId: 7n } },
  ...extra,
});

test('message receipts match random IDs across SDK long representations', () => {
  assert.equal(messageReceipt(messageAck(request, 12), request), '12');
  assert.equal(
    messageReceipt(messageAck({ randomId: { value: 42n } }, 13), request),
    '13'
  );
  assert.equal(
    messageReceipt({ className: 'UpdateShortSentMessage', id: 14 }, request),
    '14'
  );
  assert.equal(messageReceipt({ updates: [outgoing()] }, request), '25');
  assert.equal(messageReceipt({ update: outgoing() }, request), '25');
});

test('missing, malformed, unrelated and incoming updates remain uncertain', () => {
  for (const answer of [
    null,
    true,
    {},
    { updates: {} },
    { updates: [null] },
    messageAck({ randomId: 43n }, 12),
    messageAck(request, 0),
    messageAck(request, -1),
    { className: 'UpdateShortSentMessage', id: 2147483648 },
    {
      updates: [
        outgoing({ message: { id: 25, out: false, peerId: request.peer } }),
      ],
    },
    {
      updates: [
        outgoing({ message: { id: 25, out: true, peerId: { channelId: 7n } } }),
      ],
    },
    { updates: [outgoing({ className: 'UpdateNewScheduledMessage' })] },
  ]) {
    assert.throws(() => messageReceipt(answer, request), {
      code: 'send-unknown',
      ambiguous: true,
      fallback: false,
    });
  }
  assert.throws(() => messageReceipt(messageAck({}), { peer: request.peer }), {
    code: 'send-unknown',
  });
});

test('scheduled messages require the scheduling acknowledgement kind or random ID', () => {
  const scheduled = { ...request, scheduleDate: 1234 };
  assert.equal(
    messageReceipt(
      { updates: [outgoing({ className: 'UpdateNewScheduledMessage' })] },
      scheduled
    ),
    '25'
  );
  assert.throws(() => messageReceipt({ updates: [outgoing()] }, scheduled), {
    code: 'send-unknown',
  });
});
