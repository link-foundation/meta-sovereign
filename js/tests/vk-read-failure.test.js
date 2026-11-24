import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fixtureServerClose } from './helpers/fixture-server.mjs';
import { encodeWire } from '../src/transport/lino.js';
import { createVkRead } from '../src/web/vk-read-response.js';

test(
  'the production VK bridge refuses connected read failures instead of loading local defaults',
  { timeout: 10000 },
  async () => {
    let mode = 'refused';
    const server = http.createServer((req, res) => {
      const status = req.url.startsWith('/api/status');
      const missing = mode === 'missing';
      res.writeHead(status ? 200 : missing ? 404 : 400, {
        'content-type': 'text/lino',
      });
      res.end(
        encodeWire(
          status
            ? { service: 'meta-sovereign', links: 0 }
            : { ok: false, error: 'private fixture refusal' }
        )
      );
    });
    const close = fixtureServerClose(server, 'vk-read-failure');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const previous = globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES;
    globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = `http://127.0.0.1:${server.address().port}`;
    const { api, resetServerBinding } = await import('../src/web/dom.js');
    resetServerBinding();
    try {
      for (const name of [
        'vkWall',
        'vkBirthday',
        'vkOnline',
        'vkFriendStats',
      ]) {
        const refused = await api[name]();
        assert.equal(refused.ok, false, name);
        assert.equal(refused.settings, undefined);
        assert.equal(refused.cached, undefined);
        assert.equal(
          JSON.stringify(refused).includes('private fixture'),
          false
        );
      }
      mode = 'missing';
      const offline = await api.vkBirthday();
      assert.equal(offline.ok, true);
      assert.equal(offline.canRun, false);
      assert.equal(offline.schedulerRunning, false);
    } finally {
      if (previous === undefined) {
        delete globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES;
      } else {
        globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = previous;
      }
      resetServerBinding();
      await close();
    }
  }
);

test(
  'VK acknowledged reads retain signal/recovery options and refuse malformed or contradictory responses',
  { timeout: 5000 },
  async () => {
    const signal = new AbortController().signal;
    const saved = { ok: true, settings: { enabled: false } };
    let answer;
    const calls = [];
    const get = createVkRead(async (...args) => {
      calls.push(args);
      return answer;
    });
    for (const data of [null, [], {}, { ok: false }, 'private fixture']) {
      answer = { ok: true, status: 200, json: async () => data };
      assert.equal((await get('/api/vk/birthday')).ok, false);
    }
    answer = { ok: false, status: 400, json: async () => saved };
    assert.equal((await get('/api/vk/birthday')).ok, false);
    answer = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad body');
      },
    };
    assert.equal((await get('/api/vk/birthday')).ok, false);
    answer = { ok: true, status: 200, json: async () => saved };
    assert.deepEqual(
      await get('/api/vk/birthday', { signal }, { recover: false }),
      saved
    );
    assert.deepEqual(calls.at(-1), [
      '/api/vk/birthday',
      { signal },
      { recover: false, network: true },
    ]);
    for (const response of [null, { status: 404 }]) {
      answer = response;
      assert.equal(await get('/api/vk/birthday'), null);
    }
  }
);
