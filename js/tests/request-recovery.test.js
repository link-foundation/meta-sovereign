import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveringRequest } from '../src/web/request-recovery.js';
import { isReadRequest } from '../src/web/request-policy.js';
import { afterFailure, waitsForNetwork } from '../src/web/chat-outbox.js';

const json = (value, status = 200) =>
  globalThis.Response.json(value, { status });
const fixture = (fetchImpl, extra = {}) =>
  createRecoveringRequest({ fetchImpl, delays: [0], ...extra });

test('transport failures and temporary HTTP failures keep one read pending until it succeeds', async () => {
  let calls = 0;
  const client = fixture(async () => {
    calls += 1;
    if (calls < 5) {
      throw new TypeError('temporary connection interruption');
    }
    if (calls < 9) {
      return json({ ok: false, code: 'network' }, 503);
    }
    return json({ items: ['restored'] });
  });
  try {
    const a = client.request('/api/contacts', {}, { retry: true });
    const b = client.request('/api/contacts', {}, { retry: true });
    assert.deepEqual(await (await a).json(), { items: ['restored'] });
    assert.deepEqual(await (await b).json(), { items: ['restored'] });
    assert.equal(calls, 9, 'polling consumers share one recovery loop');
  } finally {
    client.stop();
  }
});

test('recovery wakes a delayed read immediately and cancellation removes its pending work', async () => {
  const target = new globalThis.EventTarget();
  let up = false;
  let calls = 0;
  const client = fixture(
    async () => {
      calls += 1;
      if (!up) {
        throw new Error('offline');
      }
      return json({ ready: true });
    },
    { target, delays: [60000] }
  );
  const cancelled = fixture(
    async () => {
      throw new Error('offline');
    },
    { delays: [60000] }
  );
  try {
    const pending = client.request('/api/profile', {}, { retry: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    up = true;
    target.dispatchEvent(new globalThis.Event('online'));
    assert.equal((await (await pending).json()).ready, true);
    assert.equal(calls, 2);
    const abandoned = cancelled.request('/api/profile', {}, { retry: true });
    cancelled.stop();
    await assert.rejects(abandoned, { name: 'AbortError' });
  } finally {
    client.stop();
    cancelled.stop();
  }
});

test('an unconfirmed mutation is attempted once; explicit refusals return for their owner to handle', async () => {
  let calls = 0;
  const client = fixture(async () => {
    calls += 1;
    throw new TypeError('network');
  });
  const refused = fixture(async () =>
    json({ ok: false, code: 'unsupported' }, 503)
  );
  try {
    await assert.rejects(
      client.request('/api/message/send', { method: 'POST' }),
      /network/
    );
    assert.equal(
      calls,
      1,
      'durable outbox owns mutation retries and idempotency'
    );
    assert.equal(
      (await refused.request('/api/feature', {}, { retry: true })).status,
      503
    );
  } finally {
    client.stop();
    refused.stop();
  }
});

test('read semantics cover GET, HEAD and explicit POST readers throughout the app', () => {
  for (const path of [
    'history',
    'history-at',
    'dialog-state',
    'profile',
    'calls',
    'folders',
    'members',
    'privacy',
    'accounts-unread',
    'stories',
    'sticker-set',
    'business-bot',
    'pinned-list',
  ]) {
    assert.equal(
      isReadRequest(`/api/telegram/${path}?telegramAccount=2`, 'POST'),
      true,
      path
    );
  }
  for (const path of [
    'send',
    'read',
    'gift-send',
    'phone-change-send',
    'password-reset',
    'private-call-start',
    'web-app-data',
    'story-post',
    'contact-import',
    'history-ttl',
  ]) {
    assert.equal(isReadRequest(`/api/telegram/${path}`, 'POST'), false, path);
  }
  assert.equal(isReadRequest('/api/contacts', 'GET'), true);
  assert.equal(isReadRequest('/api/health', 'HEAD'), true);
  assert.equal(isReadRequest('/api/settings', 'PUT'), false);
});

test('truncated JSON and structured transient read failures retry without producing an empty result', async () => {
  let calls = 0;
  const client = fixture(async () => {
    calls += 1;
    if (calls === 1) {
      return new globalThis.Response('{"incomplete":');
    }
    if (calls === 2) {
      return json({
        ok: false,
        code: 'network',
        error: 'provider is reconnecting',
      });
    }
    return json({ items: ['complete'] });
  });
  try {
    const response = await client.request(
      '/api/telegram/profile',
      { method: 'POST' },
      { retry: true, json: true }
    );
    assert.deepEqual(await response.json(), { items: ['complete'] });
    assert.equal(calls, 3);
  } finally {
    client.stop();
  }
});

test('a stalled read gets a fresh deadline on its automatic retry', async () => {
  let calls = 0;
  const client = fixture(
    async (_url, { signal }) => {
      calls += 1;
      if (calls === 1) {
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        );
      }
      return json({ restored: true });
    },
    { timeoutMs: 5 }
  );
  try {
    assert.equal(
      (
        await (
          await client.request('/api/contacts', {}, { retry: true })
        ).json()
      ).restored,
      true
    );
    assert.equal(calls, 2);
  } finally {
    client.stop();
  }
});

test('terminal HTML responses retain fallback semantics instead of retrying a missing feature forever', async () => {
  let calls = 0;
  const client = fixture(async () => {
    calls += 1;
    return new globalThis.Response('not implemented', { status: 501 });
  });
  try {
    const response = await client.request(
      '/api/feature',
      {},
      { retry: true, json: true }
    );
    assert.equal(response.status, 501);
    assert.equal(await response.json(), null);
    assert.equal(calls, 1);
  } finally {
    client.stop();
  }
});

test('every temporary connection code keeps the same queued send retrying without a limit', () => {
  for (const code of [
    'network',
    'no-answer',
    'no-connection',
    'timeout',
    'server-starting',
    'reconnecting',
  ]) {
    let item = { clientId: 'same-message', attempts: 0, replyTo: 42 };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      item = afterFailure(item, { code }, 0);
      assert.equal(item.status, 'waiting', code);
      assert.equal(waitsForNetwork(item), true, code);
      assert.equal(item.clientId, 'same-message');
      assert.equal(item.replyTo, 42);
    }
  }
});

test('interrupted binary bodies are retried before a download or media consumer receives bytes', async () => {
  let calls = 0;
  const client = fixture(async () => {
    calls += 1;
    return calls === 1
      ? {
          ok: true,
          status: 200,
          blob: async () => {
            throw new TypeError('interrupted body');
          },
        }
      : new globalThis.Response('complete bytes');
  });
  try {
    const response = await client.request(
      '/api/telegram/file',
      {},
      { retry: true, body: 'blob' }
    );
    assert.equal(await (await response.blob()).text(), 'complete bytes');
    assert.equal(calls, 2);
  } finally {
    client.stop();
  }
});

test('a healthy download can exceed the deadline in total while its bytes keep arriving', async () => {
  let now = 0;
  let next = 0;
  let calls = 0;
  const timers = new Map();
  const clock = {
    setTimeout: (fn, ms) => {
      next += 1;
      if (ms === 0) {
        globalThis.queueMicrotask(fn);
      } else {
        timers.set(next, { fn, at: now + ms });
      }
      return next;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const client = fixture(
    async (_url, { signal }) => {
      calls += 1;
      if (calls > 1) {
        return new globalThis.Response('unexpected restart');
      }
      let chunks = 0;
      return new globalThis.Response(
        new globalThis.ReadableStream({
          pull: (output) => {
            now += 10;
            for (const [id, timer] of timers) {
              if (timer.at <= now) {
                timers.delete(id);
                timer.fn();
              }
            }
            if (signal.aborted) {
              output.error(signal.reason);
            } else if (chunks++ < 50) {
              output.enqueue(new Uint8Array([1]));
            } else {
              output.close();
            }
          },
        })
      );
    },
    { clock, timeoutMs: 100 }
  );
  try {
    const response = await client.request(
      '/api/telegram/file',
      {},
      { retry: true, body: 'blob' }
    );
    assert.equal((await response.blob()).size, 50);
    assert.equal(calls, 1);
    assert.ok(now > 100);
    assert.equal(timers.size, 0);
  } finally {
    client.stop();
  }
});

test('a body that stops delivering bytes still times out and resumes automatically', async () => {
  let calls = 0;
  const client = fixture(
    async (_url, { signal }) => {
      calls += 1;
      if (calls > 1) {
        return new globalThis.Response('resumed bytes');
      }
      return new globalThis.Response(
        new globalThis.ReadableStream({
          start: (output) => {
            output.enqueue(new Uint8Array([1]));
            signal.addEventListener(
              'abort',
              () => output.error(signal.reason),
              { once: true }
            );
          },
        })
      );
    },
    { timeoutMs: 5 }
  );
  try {
    const response = await client.request(
      '/api/telegram/file',
      {},
      { retry: true, body: 'blob' }
    );
    assert.equal(await (await response.blob()).text(), 'resumed bytes');
    assert.equal(calls, 2);
  } finally {
    client.stop();
  }
});
