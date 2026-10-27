import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchChatHistory } from '../src/web/chat-history-load.js';
import { telegramRouteError } from '../src/server/telegram-route-error.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('opening a chat exposes pending state, refreshes a concurrently filled cache, and ignores late answers after leaving', async () => {
  let resolve;
  let state = {};
  let refreshed = 0;
  let request;
  const stop = watchChatHistory({
    api: {
      telegramHistory: (body) => {
        request = body;
        return new Promise((done) => {
          resolve = done;
        });
      },
    },
    current: { key: 'telegram:42', chat: '42' },
    patch: (_key, change) => {
      state = { ...state, ...change(state) };
    },
    newest: async () => {
      refreshed += 1;
    },
    delay: () => 1000,
  });
  assert.equal(state.initialLoading, true);
  assert.equal(request.priority, 'view');
  // A concurrent scroll request can fail before the foreground read succeeds.
  // Completion must also clear that older request's retry marker.
  state = { ...state, failed: true, retryAt: 5000, retryCode: 'flood-wait' };
  resolve({ cached: true, written: 0, complete: true });
  await tick();
  assert.equal(state.initialLoading, false);
  assert.equal(state.complete, true);
  assert.equal(state.failed, false);
  assert.equal(state.retryAt, 0);
  assert.equal(state.retryCode, null);
  assert.equal(refreshed, 1);
  stop();
  const lateStop = watchChatHistory({
    api: {
      telegramHistory: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
    current: { key: 'telegram:43', chat: '43' },
    patch: (_key, change) => {
      state = { ...state, ...change(state) };
    },
    newest: async () => {
      refreshed += 1;
    },
    delay: () => 1000,
  });
  lateStop();
  resolve({ written: 1, complete: true });
  await tick();
  assert.equal(refreshed, 1);
});

test('a flood wait stays visible and retries after the requested wait, then stops its timer when closed', async () => {
  let state = {};
  let scheduled;
  let cleared = 0;
  let calls = 0;
  const stop = watchChatHistory({
    api: {
      telegramHistory: async () => {
        calls += 1;
        return { error: 'wait', code: 'flood-wait', retryAfter: 20 };
      },
    },
    current: { key: 'telegram:42', chat: '42' },
    patch: (_key, change) => {
      state = { ...state, ...change(state) };
    },
    newest: async () => {},
    delay: (_tries, seconds) => seconds * 1000,
    now: () => 1000,
    setTimer: (fn, ms) => {
      scheduled = { fn, ms };
      return 7;
    },
    clearTimer: (timer) => {
      if (timer === 7) {
        cleared += 1;
      }
    },
  });
  await tick();
  assert.equal(state.retryCode, 'flood-wait');
  assert.equal(state.retryAt, 21000);
  assert.equal(state.initialLoading, false);
  assert.equal(scheduled.ms, 20000);
  assert.equal(calls, 1);
  stop();
  scheduled.fn();
  await tick();
  assert.equal(calls, 1);
  assert.equal(cleared, 1);
});

test('rate limits are 429 waits with Retry-After, while unexpected Telegram failures remain 502 errors', () => {
  const headers = {};
  const res = {
    setHeader: (key, value) => {
      headers[key] = value;
    },
    writeHead: (code) => {
      res.status = code;
    },
    end: (body) => {
      res.body = JSON.parse(body);
    },
  };
  const logs = [];
  telegramRouteError(
    res,
    '/api/telegram/history',
    Object.assign(new Error('FLOOD_WAIT_20'), {
      errorMessage: 'FLOOD_WAIT_20',
    }),
    (entry) => logs.push(entry)
  );
  assert.equal(res.status, 429);
  assert.equal(headers['retry-after'], '20');
  assert.equal(res.body.code, 'flood-wait');
  assert.equal(res.body.retryAfter, 20);
  assert.equal(logs[0].level, 'warn');
  telegramRouteError(
    res,
    '/api/telegram/history',
    new Error('unexpected'),
    (entry) => logs.push(entry)
  );
  assert.equal(res.status, 502);
  assert.equal(logs[1].level, 'error');
});
