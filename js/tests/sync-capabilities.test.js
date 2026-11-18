import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createMemoryStore } from '../src/storage/universal.js';
import { startServer } from '../src/server/index.js';
import { discoverServer } from '../src/web/discover.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { fixtureServerClose } from './helpers/fixture-server.mjs';

test(
  'status and lightweight discovery advertise actual sync listeners in both Lino formats',
  { timeout: 10000 },
  async () => {
    for (const enableSync of [false, true]) {
      const server = await startServer({
        store: createMemoryStore(),
        port: 0,
        enableSync,
        enableHandlers: false,
        telegramAccount: false,
        automations: { scheduler: false },
      });
      try {
        for (const type of [LINO_TEXT, LINO_BINARY]) {
          for (const query of ['?probe=1', '']) {
            const status = await readWireResponse(
              await fetch(
                `http://127.0.0.1:${server.port}/api/status${query}`,
                { headers: { accept: type } }
              )
            );
            assert.deepEqual(status.capabilities, {
              webRtcSync: enableSync,
              webSocketSync: enableSync,
            });
          }
        }
      } finally {
        await server.close();
      }
    }
  }
);

test('discovery preserves explicit sync capabilities and accepts older identities', async () => {
  for (const capabilities of [
    undefined,
    { webRtcSync: false, webSocketSync: false },
    { webRtcSync: true },
  ]) {
    const origin = 'http://127.0.0.1:9876';
    const found = await discoverServer({
      origin,
      storage: null,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          service: 'meta-sovereign',
          discovery: true,
          ...(capabilities ? { capabilities } : {}),
        }),
      }),
    });
    assert.deepEqual(found, {
      origin,
      ...(capabilities ? { capabilities } : {}),
    });
  }
});

test(
  'browser boot skips explicitly unavailable RTC and closes allowed bindings on reset',
  { timeout: 10000 },
  async () => {
    let capabilities = { webRtcSync: false };
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': LINO_TEXT });
      res.end(
        encodeWire({
          service: 'meta-sovereign',
          links: 0,
          ...(capabilities ? { capabilities } : {}),
        })
      );
    });
    const close = fixtureServerClose(server, 'sync-capabilities');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const sockets = [];
    const peers = [];
    const prior = {
      candidates: globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES,
      WebSocket: globalThis.WebSocket,
      RTCPeerConnection: globalThis.RTCPeerConnection,
    };
    globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = `http://127.0.0.1:${server.address().port}`;
    globalThis.WebSocket = class extends globalThis.EventTarget {
      constructor(url) {
        super();
        this.url = url;
        sockets.push(this);
      }
      close() {
        this.closed = true;
      }
    };
    globalThis.RTCPeerConnection = class {
      constructor() {
        peers.push(this);
      }
      close() {
        this.closed = true;
      }
    };
    const { api, resetServerBinding } = await import('../src/web/dom.js');
    resetServerBinding();
    try {
      assert.equal((await api.status()).service, 'meta-sovereign');
      assert.equal(
        sockets.length,
        0,
        'disabled broker must receive no connection'
      );
      assert.equal(peers.length, 0);
      for (const allowed of [{ webRtcSync: true }, undefined]) {
        resetServerBinding();
        capabilities = allowed;
        await api.status();
        assert.match(sockets.at(-1).url, /\/rtc\?room=default$/u);
      }
      assert.equal(sockets.length, 2, 'enabled and older servers retain RTC');
    } finally {
      resetServerBinding();
      await Promise.resolve();
      globalThis.META_SOVEREIGN_DISCOVERY_CANDIDATES = prior.candidates;
      globalThis.WebSocket = prior.WebSocket;
      globalThis.RTCPeerConnection = prior.RTCPeerConnection;
      await close();
    }
    assert(sockets.every((socket) => socket.closed));
    assert(peers.every((peer) => peer.closed));
  }
);
