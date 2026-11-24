import test from 'node:test';
import assert from 'node:assert/strict';
import { followTelegramFixture } from './helpers/follow-telegram.mjs';
import { followChatsFixture } from './helpers/follow-chats.mjs';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { followApi } from '../src/web/follow-api.js';
import { followTelegramApi } from '../src/web/follow-telegram-api.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
  encodeWire,
} from '../src/transport/lino.js';

const policy = { attempts: 2, delayMs: 0, maxDelayMs: 0 };
test('CLI read settings reach Telegram and VK and malformed policies never start a provider', async () => {
  const f = followTelegramFixture();
  let started = 0;
  let seen;
  const cli = createAutomationCommands({
    openStore: async () => f.store,
    createAccount: () => {
      started++;
      return f.account;
    },
    followDiscovery: {
      chats: async (input) => {
        seen = input.retry;
        return { ok: true };
      },
    },
  });
  const lines = [];
  const flags = {
    attempts: '2',
    'retry-delay-ms': '0',
    'retry-max-delay-ms': '0',
    json: true,
  };
  assert.equal(
    await cli.automations(
      { _: ['follow', 'telegram', 'join'], target: 'study_group', ...flags },
      (line) => lines.push(line)
    ),
    0
  );
  assert.deepEqual(JSON.parse(lines[0]).retry, policy);
  assert.equal(
    await cli.automations({ _: ['follow', 'chats'], ...flags }, () => {}),
    0
  );
  assert.deepEqual(seen, policy);
  assert.equal(
    await cli.automations(
      { _: ['follow', 'telegram', 'list'], attempts: 'eleven' },
      () => {}
    ),
    1
  );
  assert.equal(started, 1);
});

test(
  'text and binary Lino preserve read budgets, query serialization and scoped cancellation',
  { timeout: 15000 },
  async () => {
    const vk = await followChatsFixture();
    const tg = followTelegramFixture({ store: vk.store });
    const server = await startServer({
      store: vk.store,
      telegramAccount: tg.account,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      ...vk.serverOptions,
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const remote = {
          request: async (path, init) => {
            const response = await fetch(
              `http://127.0.0.1:${server.port}${path}`,
              {
                ...init,
                headers: {
                  accept: type,
                  ...(init?.body ? { 'content-type': type } : {}),
                },
                ...(init?.body
                  ? { body: encodeWire(JSON.parse(init.body), type) }
                  : {}),
              }
            );
            return { ok: response.ok, json: () => readWireResponse(response) };
          },
        };
        const telegram = followTelegramApi({ remote });
        const discovery = followApi({ remote, store: vk.store });
        let attempts = 0;
        tg.state.read = (request) => {
          if (request.className === 'messages.GetDialogs') {
            attempts++;
            throw Object.assign(new Error('private diagnostic'), {
              code: 'ETIMEDOUT',
            });
          }
        };
        assert.equal(
          (await telegram.followTelegramList({ retry: policy })).code,
          'timeout'
        );
        assert.equal(attempts, 2);
        vk.state.error = Object.assign(new Error('private diagnostic'), {
          code: 'ETIMEDOUT',
        });
        const before = vk.calls.length;
        await assert.rejects(discovery.followChats({ retry: policy }), {
          code: 'timeout',
        });
        assert.equal(vk.calls.length - before, 2);
        assert.deepEqual(
          await discovery.followDiscoveryCancel({ requestId: 'finished' }),
          { ok: true }
        );
        assert.equal(
          (await telegram.followTelegramCancel({ requestId: 'finished' })).ok,
          true
        );
        vk.state.error = null;
      }
    } finally {
      await server.close();
    }
  }
);

test('Follow reads retain their finite provider budget through shared HTTP recovery', async () => {
  const { isReadRequest } = await import('../src/web/request-policy.js');
  const { createRecoveringRequest } =
    await import('../src/web/request-recovery.js');
  for (const path of [
    '/api/automations/follow/chats',
    '/api/automations/follow/details',
    '/api/automations/follow/telegram',
  ]) {
    assert.equal(isReadRequest(`${path}?attempts=2`), false, path);
    let calls = 0;
    const requests = createRecoveringRequest({
      fetchImpl: async () => {
        calls++;
        return new globalThis.Response(
          JSON.stringify({ ok: false, code: 'timeout' }),
          { headers: { 'content-type': 'application/json' } }
        );
      },
    });
    const response = await requests.request(
      path,
      {},
      { retry: isReadRequest(path), json: true }
    );
    assert.deepEqual(await response.json(), { ok: false, code: 'timeout' });
    assert.equal(calls, 1);
    requests.stop();
  }
  assert.equal(
    isReadRequest('/api/automations/follow'),
    true,
    'cached links retain ordinary connection recovery'
  );
});

test(
  'server shutdown drains an issued VK discovery request after closing the HTTP socket',
  { timeout: 5000 },
  async () => {
    const f = await followChatsFixture();
    let issued;
    let release;
    const started = new Promise((resolve) => {
      issued = resolve;
    });
    const response = new Promise((resolve) => {
      release = resolve;
    });
    const server = await startServer({
      store: f.store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      follow: {
        liveFactory: () => ({
          callOnce: async () => {
            issued();
            return response;
          },
        }),
      },
    });
    const request = fetch(
      `http://127.0.0.1:${server.port}/api/automations/follow/chats`
    ).catch(() => null);
    await started;
    let closed = false;
    const closing = server.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    assert.equal(closed, false);
    release({ count: 0, items: [] });
    await closing;
    await request;
    assert.equal(closed, true);
  }
);
