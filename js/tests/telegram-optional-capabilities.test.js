import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { fixtureServerClose } from './helpers/fixture-server.mjs';

const features = ['quickReaction', 'quickReactionSet', 'urlAuthDomains'];
const options = {
  port: 0,
  enableHandlers: false,
  enableSync: false,
  automations: { scheduler: false },
};

test(
  'absent Telegram explicitly disables optional reaction and login-domain operations',
  { timeout: 10000 },
  async (t) => {
    const server = await startServer({
      ...options,
      store: createMemoryStore(),
      telegramAccount: false,
    });
    t.after(() => server.close());
    for (const accept of [LINO_TEXT, LINO_BINARY]) {
      const status = await readWireResponse(
        await fetch(`http://127.0.0.1:${server.port}/api/telegram/status`, {
          headers: { accept },
        })
      );
      for (const feature of features) {
        assert.equal(status.capabilities[feature], false, feature);
      }
    }
  }
);

test(
  'optional capabilities follow each actual account method independently',
  { timeout: 10000 },
  async (t) => {
    let kind = 'user';
    const account = {
      status: async () => ({ connected: false, kind }),
      quickReaction: async () => ({ ok: true, emoji: '👍' }),
    };
    const server = await startServer({
      ...options,
      store: createMemoryStore(),
      telegramAccount: account,
    });
    t.after(() => server.close());
    const read = async () =>
      readWireResponse(
        await fetch(`http://127.0.0.1:${server.port}/api/telegram/status`)
      );
    let status = await read();
    assert.equal(status.capabilities.quickReaction, true);
    assert.equal(status.capabilities.quickReactionSet, false);
    assert.equal(status.capabilities.urlAuthDomains, false);
    delete account.quickReaction;
    account.quickReactionSet = async () => ({ ok: true });
    account.urlAuthDomains = async () => ({ ok: true, domains: [] });
    status = await read();
    assert.equal(status.capabilities.quickReaction, false);
    assert.equal(status.capabilities.quickReactionSet, true);
    assert.equal(status.capabilities.urlAuthDomains, true);
    for (kind of ['bot', null]) {
      status = await read();
      for (const feature of features) {
        assert.equal(status.capabilities[feature], false, feature);
      }
    }
  }
);

const withBridge = async (run) => {
  const seen = [];
  let status = { available: false };
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    const answer =
      req.url === '/api/telegram/status'
        ? status
        : req.url.startsWith('/api/status')
          ? {
              service: 'meta-sovereign',
              links: 0,
              capabilities: { webRtcSync: false },
            }
          : { ok: true, emoji: '👍', domains: ['example.org'] };
    res.writeHead(200, { 'content-type': 'text/lino' });
    res.end(encodeWire(answer));
  });
  const close = fixtureServerClose(server, 'telegram-optional-capabilities');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const prior = globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES;
  globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = `http://127.0.0.1:${server.address().port}`;
  const { api, resetServerBinding } = await import('../src/web/dom.js');
  resetServerBinding();
  try {
    await run({
      api,
      seen,
      setStatus: (value) => {
        status = value;
      },
    });
  } finally {
    resetServerBinding();
    globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = prior;
    await close();
  }
};

test(
  'the browser skips unavailable optional routes and preserves enabled and legacy behavior',
  { timeout: 10000 },
  async () => {
    await withBridge(async ({ api, seen, setStatus }) => {
      const calls = [
        () => api.telegramQuickReaction(),
        () => api.telegramQuickReactionSet({ emoji: '👍' }),
        () => api.telegramUrlAuthDomains(),
      ];
      const operations = () =>
        seen.filter((url) => /quick-reaction|url-auth-domains/u.test(url));
      for (const status of [
        { available: false },
        {
          connected: true,
          capabilities: Object.fromEntries(features.map((f) => [f, false])),
        },
      ]) {
        setStatus(status);
        for (const call of calls) {
          assert.deepEqual(await call(), {
            ok: false,
            unsupported: true,
            offline: false,
          });
        }
        assert.equal(operations().length, 0);
      }
      for (const status of [
        {
          connected: false,
          capabilities: Object.fromEntries(features.map((f) => [f, true])),
        },
        { connected: true, kind: 'user' },
      ]) {
        setStatus(status);
        for (const call of calls) {
          assert.equal((await call()).ok, true);
        }
      }
      assert.equal(operations().length, 6);
      setStatus({ offline: true });
      for (const call of calls) {
        const answer = await call();
        assert.equal(answer.ok, false);
        assert.equal(answer.offline, true);
        assert.equal(
          answer.unsupported,
          false,
          'unreachable status is unknown'
        );
      }
      assert.equal(operations().length, 6);
    });
  }
);
