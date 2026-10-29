import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUserConnection } from '../src/sources/telegram-account.js';
import { messageLengthMax } from '../src/sources/telegram-message-limit.js';
import { MAX_MESSAGE_LENGTH, sendError } from '../src/sources/telegram-send.js';
import { afterFailure } from '../src/web/chat-outbox.js';

test('a disconnected cached client is replaced once for concurrent callers', async () => {
  const clients = [];
  const connection = createUserConnection({
    now: () => 0,
    clientFactory: async () => {
      const client = {
        connected: true,
        ended: false,
        connect: async () => {},
        getMe: async () => ({ id: 1 }),
        destroy: async () => {
          client.ended = true;
        },
      };
      clients.push(client);
      return client;
    },
  });
  const credentials = { apiId: '1', apiHash: 'fake', session: 'fake' };
  const old = await connection.open(credentials);
  old.client.connected = false;
  const [a, b, c] = await Promise.all([
    connection.open(credentials),
    connection.open(credentials),
    connection.open(credentials),
  ]);
  assert.equal(clients.length, 2);
  assert.equal(old.client.ended, true);
  assert.equal(a.client, clients[1]);
  assert.equal(a, b);
  assert.equal(b, c);
  await connection.disconnect();
});

test('a lost optional configuration RPC cannot indefinitely hold a send', async () => {
  let expire;
  let finish;
  let calls = 0;
  const client = {
    invoke: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const Api = { help: { GetConfig: class {} } };
  const timers = {
    setTimer: (fn) => {
      expire = fn;
      return 1;
    },
    clearTimer: () => {},
  };
  const limit = messageLengthMax(client, Api, timers);
  await Promise.resolve();
  expire();
  assert.equal(await limit, MAX_MESSAGE_LENGTH);
  finish({ messageLengthMax: 8192 });
  assert.equal(await messageLengthMax(client, Api, timers), 8192);
  assert.equal(
    calls,
    1,
    'the late result is reused without another metadata RPC'
  );
});

test('explicit disconnected send refusals stay queued with the original idempotency key', () => {
  const error = sendError(
    new Error('Cannot send requests while disconnected. Please connect first.')
  );
  assert.equal(error.code, 'telegram-reconnect');
  const next = afterFailure(
    { clientId: 'stable-id', status: 'sending', attempts: 20 },
    error,
    0
  );
  assert.equal(next.status, 'waiting');
  assert.equal(next.clientId, 'stable-id');
  assert.ok(next.retryAt > 0);
});
