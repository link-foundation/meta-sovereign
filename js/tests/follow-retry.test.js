import test from 'node:test';
import assert from 'node:assert/strict';
import { followRetryPolicy, withFollowRetry } from '../src/follow/retry.js';
import { createVkLive } from '../src/sources/vk.js';

test('Follow retries only timeouts, using a finite capped exponential delay', async () => {
  const delays = [];
  const events = [];
  let calls = 0;
  assert.equal(
    await withFollowRetry(
      () => {
        calls += 1;
        if (calls < 4) {
          throw Object.assign(new Error('private detail'), { code: 'timeout' });
        }
        return 'receipt';
      },
      {
        policy: { attempts: 4, delayMs: 10, maxDelayMs: 15 },
        sleep: async (ms) => delays.push(ms),
        trace: (event) => events.push(event),
      }
    ),
    'receipt'
  );
  assert.equal(calls, 4);
  assert.deepEqual(delays, [10, 15, 15]);
  assert.equal(JSON.stringify(events).includes('private'), false);
});

test('timeout exhaustion preserves the actual last error and never exceeds attempts', async () => {
  const errors = [1, 2, 3].map((n) =>
    Object.assign(new Error(`private ${n}`), { errorMessage: 'TIMEOUT' })
  );
  let calls = 0;
  await assert.rejects(
    withFollowRetry(
      () => {
        throw errors[calls++];
      },
      { sleep: async () => {} }
    ),
    (error) => error === errors[2]
  );
  assert.equal(calls, 3);
});

test('rate limits, permissions, invites, internal errors and ambiguous sends are not retried', async () => {
  for (const fields of [
    { vkCode: 6, code: 'timeout' },
    { vkCode: 15 },
    { errorMessage: 'FLOOD_WAIT_20', code: 'timeout' },
    { errorMessage: 'INVITE_HASH_EXPIRED' },
    { errorMessage: 'CHAT_WRITE_FORBIDDEN' },
    { errorMessage: 'INTERNAL', code: 500 },
    { code: 'send-unknown', cause: { code: 'timeout' } },
    { name: 'AbortError' },
    {},
  ]) {
    const actual = Object.assign(new Error('TIMEOUT in private text'), fields);
    let calls = 0;
    await assert.rejects(
      withFollowRetry(() => {
        calls += 1;
        throw actual;
      }),
      (error) => error === actual
    );
    assert.equal(calls, 1);
  }
});

test('writes require a stable idempotency contract or a positive safe-to-retry error', async () => {
  for (const options of [{}, { idempotent: true }, { safeToRetry: true }]) {
    let calls = 0;
    const actual = Object.assign(new Error('timeout'), {
      code: 'timeout',
      ...(options.safeToRetry ? { safeToRetry: true } : {}),
    });
    await assert.rejects(
      withFollowRetry(
        () => {
          calls += 1;
          throw actual;
        },
        { write: true, ...options, sleep: async () => {} }
      ),
      (error) => error === actual
    );
    assert.equal(calls, options.idempotent || options.safeToRetry ? 3 : 1);
  }
});

test('cancellation during backoff prevents the next request; invalid bounds do no work', async () => {
  let cancelled = false;
  let calls = 0;
  await assert.rejects(
    withFollowRetry(
      () => {
        calls += 1;
        throw Object.assign(new Error('timeout'), { code: 'timeout' });
      },
      {
        cancelled: () => cancelled,
        sleep: async () => {
          cancelled = true;
        },
      }
    ),
    { code: 'cancelled' }
  );
  assert.equal(calls, 1);
  for (const input of [
    null,
    [],
    { attempts: 0 },
    { attempts: 11 },
    { attempts: '3' },
    { delayMs: -1 },
    { delayMs: 100, maxDelayMs: 50 },
    { maxDelayMs: Infinity },
  ]) {
    assert.throws(() => followRetryPolicy(input), { code: 'bad-request' });
  }
});

test('VK single calls disable hidden rate-limit retries and distinguish POST reads from writes', async () => {
  const methods = [];
  let response;
  const live = createVkLive({
    token: 'fixture-placeholder',
    limiter: { wait: async () => {} },
    fetchImpl: async (url) => {
      methods.push(new URL(url).pathname);
      if (response === 'timeout') {
        throw Object.assign(new Error('fixture'), { name: 'TimeoutError' });
      }
      return new globalThis.Response(JSON.stringify(response));
    },
  });
  response = { error: { error_code: 6, error_msg: 'rate limit' } };
  await assert.rejects(live.callOnce('messages.send'), { vkCode: 6 });
  assert.equal(methods.length, 1);
  response = 'timeout';
  await assert.rejects(
    live.callOnce('messages.getHistory', {}, { write: false }),
    { code: 'timeout' }
  );
  assert.equal(methods.length, 2);
  await assert.rejects(live.callOnce('messages.send'), {
    code: 'send-unknown',
    ambiguous: true,
  });
  assert.equal(methods.length, 3);
  response = { response: 42 };
  assert.equal(await live.callOnce('messages.send'), 42);
});
